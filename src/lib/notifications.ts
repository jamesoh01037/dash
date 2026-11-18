import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  getDb,
  saveDb,
  GoogleDriveFileItem,
  JuniorNotificationItem,
  OtherPersonTaskItem,
  AttachmentSummaryItem,
  TodoItem,
  CalendarEventItem,
} from "./db";
import {
  getGoogleDriveAuthStatus,
  syncGoogleDriveFiles,
  readDriveFileContent,
} from "./googleDrive";
import {
  buildGoogleCalendarTemplateUrl,
  registerGoogleCalendarEventToJuniorList,
  registerGoogleTaskToJuniorList,
} from "./googleTasksAndCalendar";
import {
  fetchRecentGmailMessagesWithAttachments,
  DetailedGmailMessage,
  ParsedEmailAttachment,
  unsnoozeGmailMessageToInbox,
} from "./gmail";
import { generateId } from "./utils";

interface ExtractedDocAnalysis {
  summary: string;
  myTodos: Array<{
    title: string;
    dueDate?: string;
    priority?: "low" | "medium" | "high";
  }>;
  schedules: Array<{
    title: string;
    startTime: string;
    location?: string;
    description?: string;
  }>;
  otherPeopleTasks: OtherPersonTaskItem[];
  attachmentSummaries?: AttachmentSummaryItem[];
}

function isCreatedByAnotherPerson(
  file: GoogleDriveFileItem,
  myEmail: string,
  myName: string
): boolean {
  if (file.mimeType.includes("google-apps.folder")) return false;

  const ownerEmail = (file.ownerEmail || "").trim().toLowerCase();
  const ownerName = (file.ownerName || "").trim().toLowerCase();
  const cleanMyEmail = myEmail.trim().toLowerCase();
  const cleanMyName = myName.trim().toLowerCase();

  if (ownerEmail) {
    if (cleanMyEmail && ownerEmail === cleanMyEmail) return false;
    if (cleanMyName && ownerEmail.startsWith(`${cleanMyName}@`)) return false;
    return true;
  }

  if (ownerName) {
    if (
      ownerName === cleanMyName ||
      ownerName === "james" ||
      ownerName === "나" ||
      ownerName === "내 드라이브" ||
      ownerName === "me"
    ) {
      return false;
    }
    return true;
  }

  return false;
}

function summarizeRawText(rawText: string, defaultLabel: string): string {
  const lines = (rawText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && !l.startsWith("#"));
  if (lines.length === 0) return `• ${defaultLabel}`;
  return lines
    .slice(0, 3)
    .map((l) => `• ${l.replace(/^[-*•]\s*/, "")}`)
    .join("\n");
}

/**
 * Deterministic fallback parser so even without Gemini API key or quota,
 * summaries, my todos, calendar schedules, other people's tasks ("제목 / 해당 일을 해야 할 사람 / 기한"),
 * and attached document summaries are accurately extracted.
 */
function fallbackParseContent(params: {
  sourceTitle: string;
  ownerLabel: string;
  rawText: string;
  myName: string;
  attachments?: ParsedEmailAttachment[];
}): ExtractedDocAnalysis {
  const cleanText = (params.rawText || params.sourceTitle).trim();
  const combinedForExtraction = [
    cleanText,
    ...(params.attachments || []).map((a) => a.extractedText || ""),
  ].join("\n");

  const lines = combinedForExtraction
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const summary = summarizeRawText(
    cleanText,
    `'${params.sourceTitle}' (${params.ownerLabel}) 핵심 내용 요약`
  );

  const myTodos: ExtractedDocAnalysis["myTodos"] = [];
  const schedules: ExtractedDocAnalysis["schedules"] = [];
  const otherPeopleTasks: OtherPersonTaskItem[] = [];
  const myKeywords = [params.myName.toLowerCase(), "james", "제임스", "본인", "나"];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // 1. Check for schedule / meeting lines
    if (
      /(일정|회의|미팅|발표|세미나|워크숍|킥오프|리뷰|데모|면담)/.test(line) &&
      /(\d{1,2}월\s*\d{1,2}일|\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}|오전|오후|내일|다음\s*주)/.test(
        line
      )
    ) {
      const timeMatch = line.match(
        /(\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:\s+\d{1,2}:\d{2})?|\d{1,2}월\s*\d{1,2}일(?:\s*(?:오전|오후)?\s*\d{1,2}(?:시|:\d{2}))?|\d{1,2}\/\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
      );
      schedules.push({
        title: line.replace(/^[-*•\d.)\s]+/, "").slice(0, 80),
        startTime: timeMatch ? timeMatch[1] : "일정 확인 필요",
        description: `출처: ${params.sourceTitle}`,
      });
    }

    // 2. Check for "제목 / 담당자 / 기한" format
    const slashParts = line.replace(/^[-*•\d.)\s]+/, "").split(/\s*\/\s*/);
    if (
      slashParts.length >= 3 &&
      !line.startsWith("http") &&
      !line.includes("제목 /")
    ) {
      const [tTitle, tAssignee, tDeadline] = slashParts;
      if (tTitle && tAssignee && tDeadline) {
        const isMe = myKeywords.some((k) => tAssignee.toLowerCase().includes(k));
        if (isMe) {
          myTodos.push({
            title: `${tTitle} (${params.sourceTitle})`,
            dueDate: tDeadline,
            priority: "high",
          });
        } else {
          otherPeopleTasks.push({
            title: tTitle,
            assignee: tAssignee,
            deadline: tDeadline,
          });
        }
        continue;
      }
    }

    // 3. Check for action item / task keywords
    if (
      /(할\s*일|액션|담당|검토|작성|제출|준비|확인|마감|기한|회신|승인|요청|todo|action)/i.test(
        line
      )
    ) {
      const dueMatch = line.match(
        /(?:기한|마감|까지|due)[:\s]*([0-9년월일./\s:-]+)|(\d{4}-\d{2}-\d{2}|\d{1,2}월\s*\d{1,2}일|\d{1,2}\/\d{1,2})/i
      );
      const deadline = dueMatch
        ? (dueMatch[1] || dueMatch[2] || "기한 미정").trim()
        : "기한 미정";

      const isMe = myKeywords.some((k) => lower.includes(k));
      const assigneeMatch = line.match(
        /(?:담당자?|책임자?|수행자?)[:\s]*([가-힣a-zA-Z0-9_]+(?:\s*[팀장대리과장매니저연구원디자이너님])?)/
      );
      const namePrefixMatch = line.match(
        /^[-*•\s]*\[?([가-힣]{2,4}(?:\s*(?:팀장|책임|선임|매니저|대리|과장|디자이너|연구원|님))?)\]?\s*[:\-]\s*(.+)$/
      );

      if (isMe) {
        myTodos.push({
          title: line.replace(/^[-*•\d.)\s]+/, "").slice(0, 90),
          dueDate: deadline !== "기한 미정" ? deadline : undefined,
          priority: "high",
        });
      } else if (assigneeMatch) {
        const person = assigneeMatch[1].trim();
        const personIsMe = myKeywords.some((k) => person.toLowerCase().includes(k));
        if (personIsMe) {
          myTodos.push({
            title: line.replace(/^[-*•\d.)\s]+/, "").slice(0, 90),
            dueDate: deadline !== "기한 미정" ? deadline : undefined,
            priority: "high",
          });
        } else {
          otherPeopleTasks.push({
            title: line
              .replace(/^[-*•\d.)\s]+/, "")
              .replace(/\(?\s*담당.*$/, "")
              .trim()
              .slice(0, 80),
            assignee: person,
            deadline,
          });
        }
      } else if (namePrefixMatch) {
        const person = namePrefixMatch[1].trim();
        const taskBody = namePrefixMatch[2].trim();
        const personIsMe = myKeywords.some((k) => person.toLowerCase().includes(k));
        if (personIsMe) {
          myTodos.push({
            title: taskBody.slice(0, 90),
            dueDate: deadline !== "기한 미정" ? deadline : undefined,
            priority: "high",
          });
        } else {
          otherPeopleTasks.push({
            title: taskBody.slice(0, 80),
            assignee: person,
            deadline,
          });
        }
      }
    }
  }

  const attachmentSummaries: AttachmentSummaryItem[] = (params.attachments || []).map(
    (att) => ({
      fileName: att.filename,
      mimeType: att.contentType,
      size: att.size,
      summary: summarizeRawText(
        att.extractedText,
        `첨부 문서 '${att.filename}' 핵심 내용 요약`
      ),
    })
  );

  return {
    summary,
    myTodos: myTodos.slice(0, 5),
    schedules: schedules.slice(0, 5),
    otherPeopleTasks: otherPeopleTasks.slice(0, 8),
    attachmentSummaries,
  };
}

async function analyzeContentWithAI(params: {
  sourceType: "drive" | "gmail";
  sourceTitle: string;
  ownerLabel: string;
  content: string;
  myName: string;
  myEmail: string;
  attachments?: ParsedEmailAttachment[];
}): Promise<ExtractedDocAnalysis> {
  const db = getDb();
  const apiKey = db.settings.apiKey || process.env.GEMINI_API_KEY;
  const fallback = fallbackParseContent({
    sourceTitle: params.sourceTitle,
    ownerLabel: params.ownerLabel,
    rawText: params.content,
    myName: params.myName,
    attachments: params.attachments,
  });

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return fallback;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: db.settings.model || "gemini-2.0-flash",
    });

    const attachmentsBlock =
      params.attachments && params.attachments.length > 0
        ? `\n[첨부 문서 목록 (${params.attachments.length}개)]:\n` +
          params.attachments
            .map(
              (a, i) =>
                `첨부 #${i + 1} 파일명: ${a.filename} (${a.contentType})\n첨부 본문:\n${(
                  a.extractedText || ""
                ).slice(0, 3000)}`
            )
            .join("\n\n")
        : "";

    const prompt = `당신은 '${params.myName}'(${params.myEmail || "사용자"})님의 전담 AI 비서 Junior입니다.
${
  params.sourceType === "gmail"
    ? `새로 수신된 이메일 '${params.sourceTitle}' (발신자: ${params.ownerLabel}) 및 첨부 문서`
    : `다른 사람(${params.ownerLabel})이 Google Drive에 새로 등록한 문서 '${params.sourceTitle}'`
}를 분석하여 반드시 아래 JSON 형식으로만 응답하세요.

[분석 규칙]
1. summary: 본문 핵심 내용을 2~3줄 불릿(•)으로 간결하게 한국어 요약
2. attachmentSummaries: 첨부된 문서가 있다면 각 첨부 문서별 핵심 요약 배열 (첨부 문서가 없으면 빈 배열 [])
   - 각 항목: { "fileName": "첨부파일명", "mimeType": "MIME타입", "summary": "• 첨부 문서 핵심 요약 2~3줄" }
3. myTodos: '${params.myName}'(또는 나, 본인, 수신자)가 수행해야 할 일이 있다면 배열로 추출 (없으면 빈 배열 [])
   - 각 항목: { "title": "할 일 제목", "dueDate": "기한(있을 경우)", "priority": "high" | "medium" | "low" }
4. schedules: 본문 또는 첨부 문서에 포함된 회의, 미팅, 발표, 마감 일정 등 캘린더에 등록할 일정이 있다면 배열로 추출 (없으면 빈 배열 [])
   - 각 항목: { "title": "일정 제목", "startTime": "일시 (예: 2026-11-20 14:00)", "location": "장소(선택)", "description": "설명" }
5. otherPeopleTasks: '${params.myName}' 외에 다른 사람이 해야 할 일이 있다면 배열로 추출 (없으면 빈 배열 [])
   - 각 항목: { "title": "해야 할 일 제목", "assignee": "해당 일을 해야 할 사람 이름/직함", "deadline": "기한(없으면 '기한 미정')" }

[제목]: ${params.sourceTitle}
[발신/작성자]: ${params.ownerLabel}
[본문]:
${(params.content || "").slice(0, 6000)}
${attachmentsBlock}

JSON만 출력하세요:`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedDocAnalysis>;
      return {
        summary: parsed.summary || fallback.summary,
        myTodos:
          Array.isArray(parsed.myTodos) && parsed.myTodos.length > 0
            ? parsed.myTodos
            : fallback.myTodos,
        schedules:
          Array.isArray(parsed.schedules) && parsed.schedules.length > 0
            ? parsed.schedules
            : fallback.schedules,
        otherPeopleTasks:
          Array.isArray(parsed.otherPeopleTasks) && parsed.otherPeopleTasks.length > 0
            ? parsed.otherPeopleTasks
            : fallback.otherPeopleTasks,
        attachmentSummaries:
          Array.isArray(parsed.attachmentSummaries) &&
          parsed.attachmentSummaries.length > 0
            ? parsed.attachmentSummaries
            : fallback.attachmentSummaries,
      };
    }
  } catch {
    // Use deterministic fallback on any AI error
  }

  return fallback;
}

/**
 * Registers extracted myTodos and schedules into DB (`db.todos` and `db.calendarEvents`),
 * returning the registered records for the notification item.
 */
async function registerExtractedTodosAndSchedules(params: {
  sourceLabel: string;
  sourceDocId: string;
  ownerLabel: string;
  analysis: ExtractedDocAnalysis;
  nowIso: string;
}): Promise<{
  registeredTodos: JuniorNotificationItem["myTodosRegistered"];
  registeredEvents: JuniorNotificationItem["calendarEventsRegistered"];
}> {
  const db = getDb();
  if (!db.todos) db.todos = [];
  if (!db.calendarEvents) db.calendarEvents = [];
  const assistantName = db.settings?.assistantName?.trim() || "Junior";

  const registeredTodos: JuniorNotificationItem["myTodosRegistered"] = [];
  for (const t of params.analysis.myTodos) {
    if (!t.title?.trim()) continue;
    const newTodo: TodoItem = {
      id: generateId(),
      title: t.title.trim(),
      description: `[${assistantName} 알림 후보] '${params.sourceLabel}' (${params.ownerLabel})에서 추출된 내 할 일`,
      priority: t.priority || "high",
      dueDate: t.dueDate,
      listName: assistantName,
      completed: false,
      createdAt: params.nowIso,
      updatedAt: params.nowIso,
    };
    db.todos.unshift(newTodo);
    registeredTodos.push({
      id: newTodo.id,
      title: newTodo.title,
      dueDate: newTodo.dueDate,
      priority: newTodo.priority,
      listName: assistantName,
    });
  }

  const registeredEvents: JuniorNotificationItem["calendarEventsRegistered"] = [];
  for (const s of params.analysis.schedules) {
    if (!s.title?.trim()) continue;
    const newCalEvent: CalendarEventItem = {
      id: generateId(),
      title: s.title.trim(),
      startTime: s.startTime || "일정 확인 필요",
      location: s.location,
      description: s.description || `출처: ${params.sourceLabel} (${params.ownerLabel})`,
      listName: assistantName,
      sourceDocId: params.sourceDocId,
      sourceDocName: params.sourceLabel,
      createdAt: params.nowIso,
    };
    db.calendarEvents.unshift(newCalEvent);

    registeredEvents.push({
      id: newCalEvent.id,
      title: newCalEvent.title,
      startTime: newCalEvent.startTime,
      listName: assistantName,
    });
  }

  saveDb(db);
  return { registeredTodos, registeredEvents };
}

/**
 * Runs the 5-minute Junior Notification check across BOTH Google Drive AND Gmail:
 * 1. Google Drive: Detects new documents created by other people, summarizes them, registers my tasks into To-Dos, registers schedules into Calendar, and formats other people's tasks as "제목 / 해당 일을 해야 할 사람 / 기한".
 * 2. Gmail: Detects newly arrived emails, summarizes the email AND any attached documents, registers my tasks into To-Dos, registers schedules into Calendar, and formats other people's tasks as "제목 / 해당 일을 해야 할 사람 / 기한".
 * 3. Silent Rule: If there is nothing new to notify (newCount === 0), sends NO notification at all.
 */
export async function checkJuniorNotifications(options?: {
  simulateExternalDoc?: boolean;
  simulateNewEmail?: boolean;
}): Promise<{
  success: boolean;
  newCount: number;
  newNotifications: JuniorNotificationItem[];
  lastCheckedAt: string;
}> {
  const db = getDb();
  if (!db.notifications) db.notifications = [];
  if (!db.calendarEvents) db.calendarEvents = [];
  if (!db.todos) db.todos = [];
  if (!db.googleDriveFiles) db.googleDriveFiles = [];
  if (!db.notificationState) {
    db.notificationState = {
      enabled: true,
      intervalMinutes: 5,
      initializedBaseline: false,
      initializedEmailBaseline: false,
      processedDriveFileIds: [],
      processedEmailIds: [],
    };
  }
  if (!db.notificationState.processedEmailIds) {
    db.notificationState.processedEmailIds = [];
  }

  const myName = db.settings.userName || "사용자";
  const myEmail =
    db.settings.googleDriveConfig?.connectedEmail ||
    db.settings.gmailConfig?.email ||
    db.settings.gmailTokens?.email ||
    "";

  // Optional Simulation 1: External shared Google Drive document
  if (options?.simulateExternalDoc) {
    const simId = `gdrive-shared-${Date.now()}`;
    const simFile: GoogleDriveFileItem = {
      id: simId,
      driveFileId: simId,
      name: `2026년_신규프로젝트_협업계획서_${new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      })}.hwpx`,
      mimeType: "application/vnd.hancom.hwpx",
      shared: true,
      starred: false,
      ownerName: "김민수 팀장",
      ownerEmail: "minsu.kim@partner-tech.co.kr",
      description: "외부 파트너사 김민수 팀장이 공유한 신규 AI 프로젝트 협업 및 일정 계획서",
      contentPreview: [
        "1. 문서 개요: 차세대 AI 에이전트 연동 프로젝트 11월 협업 계획 및 역할 분담 안내드립니다.",
        "2. 주요 프로젝트 일정:",
        "- 2026-11-20 14:00 차세대 AI 에이전트 킥오프 전체 미팅 (대회의실 A)",
        "- 2026-11-25 16:00 보안 아키텍처 중간 점검 회의",
        "3. 담당자별 해야 할 일 (Action Items):",
        `- Google Drive API 연동 아키텍처 최종 승인 및 보안 키 발급 / ${myName} / 2026-11-18까지`,
        "- 프론트엔드 UI 디자인 시안 확정 및 가이드 배포 / 이지은 디자이너 / 2026-11-19까지",
        "- 클라우드 인프라 방화벽 정책 검토 및 테스트 서버 증설 / 박준영 수석연구원 / 2026-11-21까지",
        "- 외부 기관용 한글(.hwpx) 결과보고서 양식 취합 / 최유진 매니저 / 2026-11-24까지",
      ].join("\n"),
      source: "google_drive_api",
      modifiedTime: new Date().toISOString(),
    };
    db.googleDriveFiles.unshift(simFile);
    saveDb(db);
  } else if (!options?.simulateNewEmail) {
    const authStatus = getGoogleDriveAuthStatus();
    if (authStatus.hasDriveToken) {
      await syncGoogleDriveFiles({ pageSize: 40 });
    }
  }

  const nowIso = new Date().toISOString();
  const createdNotifications: JuniorNotificationItem[] = [];

  // =========================================================================
  // PART A: Check Google Drive for new documents created by other people
  // =========================================================================
  const freshDb = getDb();
  const state = freshDb.notificationState;
  if (!state.processedDriveFileIds) state.processedDriveFileIds = [];
  if (!state.processedEmailIds) state.processedEmailIds = [];
  const allFiles = freshDb.googleDriveFiles || [];

  if (!state.initializedBaseline && !options?.simulateExternalDoc) {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const f of allFiles) {
      const key = f.driveFileId || f.id;
      const modTime = new Date(f.modifiedTime).getTime();
      if (modTime < tenMinutesAgo && !state.processedDriveFileIds.includes(key)) {
        state.processedDriveFileIds.push(key);
      }
    }
    state.initializedBaseline = true;
    saveDb(freshDb);
  }

  const newExternalFiles = allFiles.filter((f) => {
    const key = f.driveFileId || f.id;
    if (state.processedDriveFileIds.includes(key)) return false;
    return isCreatedByAnotherPerson(f, myEmail, myName);
  });

  for (const file of newExternalFiles) {
    const fileKey = file.driveFileId || file.id;
    state.processedDriveFileIds.push(fileKey);
    saveDb(freshDb);

    const readRes = await readDriveFileContent(fileKey);
    const contentText = readRes.content || file.contentPreview || file.description || "";

    const analysis = await analyzeContentWithAI({
      sourceType: "drive",
      sourceTitle: file.name,
      ownerLabel: `${file.ownerName || "외부 사용자"}${
        file.ownerEmail ? ` <${file.ownerEmail}>` : ""
      }`,
      content: contentText,
      myName,
      myEmail,
    });

    const { registeredTodos, registeredEvents } =
      await registerExtractedTodosAndSchedules({
        sourceLabel: `[Drive] ${file.name}`,
        sourceDocId: fileKey,
        ownerLabel: file.ownerName || file.ownerEmail || "외부 문서",
        analysis,
        nowIso,
      });

    const latestDb = getDb();
    const notif: JuniorNotificationItem = {
      id: generateId(),
      type: "drive_new_shared_doc",
      title: `📄 다른 사용자가 새 문서를 등록했습니다: '${file.name}'`,
      fileId: fileKey,
      fileName: file.name,
      fileMimeType: file.mimeType,
      fileWebViewLink: file.webViewLink,
      ownerName: file.ownerName || file.ownerEmail || "외부 공유자",
      ownerEmail: file.ownerEmail,
      summary: analysis.summary,
      myTodosRegistered: registeredTodos,
      calendarEventsRegistered: registeredEvents,
      otherPeopleTasks: analysis.otherPeopleTasks.map((o) => ({
        title: o.title || "업무 항목",
        assignee: o.assignee || "담당자 미지정",
        deadline: o.deadline || "기한 미정",
      })),
      read: false,
      createdAt: nowIso,
    };

    latestDb.notifications.unshift(notif);
    saveDb(latestDb);
    createdNotifications.push(notif);
  }

  // =========================================================================
  // PART B: Check Gmail for newly arrived emails & attached documents
  // =========================================================================
  let candidateEmails: DetailedGmailMessage[] = [];

  if (options?.simulateNewEmail) {
    candidateEmails = [
      {
        uid: `sim-email-${Date.now()}`,
        fromName: "박지훈 본부장",
        fromEmail: "jihoon.park@enterprise.co.kr",
        fromRaw: "박지훈 본부장 <jihoon.park@enterprise.co.kr>",
        to: myEmail || "james@gmail.com",
        subject: "[긴급/공유] 11월 차세대 AI 플랫폼 최종 점검 일정 및 담당자별 과업 안내 (첨부: 점검계획서.hwpx)",
        dateIso: nowIso,
        isUnread: true,
        bodyText: [
          `안녕하세요 ${myName}님, 박지훈 본부장입니다.`,
          "금주 진행되는 차세대 AI 플랫폼 최종 점검 회의 일정과 각 담당자별 준비 사항을 전달드립니다.",
          "- 2026-11-22 10:30 차세대 AI 플랫폼 최종 점검 전체 회의 (본사 대회의실 B)",
          `- Google Workspace OAuth 보안 검수 보고서 최종본 제출 / ${myName} / 2026-11-19까지`,
          "- 부하 테스트 시나리오 결과표 정리 및 발표자료 취합 / 정현우 선임연구원 / 2026-11-20까지",
          "- 고객사 시연용 데모 계정 발급 및 네트워크 점검 / 강다영 엔지니어 / 2026-11-21까지",
        ].join("\n"),
        attachments: [
          {
            filename: "2026_AI플랫폼_최종점검계획서_v2.hwpx",
            contentType: "application/vnd.hancom.hwpx",
            size: 38912,
            extractedText: [
              "• [첨부 문서 요약] 2026년 11월 차세대 AI 플랫폼 상용화 전 보안·성능·UI 최종 점검 항목 정의서입니다.",
              "• Gmail, Google 주소록, Google Chat, Google Drive 및 크롬 rhwp 확장프로그램 연동 정상 작동 여부를 중점 확인합니다.",
              "• 점검 완료 후 결과 보고서를 2026-11-26 15:00 경영진 보고 회의에서 최종 브리핑합니다.",
            ].join("\n"),
          },
        ],
      },
    ];
  } else {
    const dbSettings = getDb().settings;
    const emailCheckCount = Math.max(
      1,
      Math.min(100, Number(dbSettings.emailCheckCount) || 20)
    );
    const emailCheckScope = dbSettings.emailCheckScope || "all_except_spam";

    const gmailRes = await fetchRecentGmailMessagesWithAttachments(
      emailCheckCount,
      emailCheckScope
    );
    if (gmailRes.success && gmailRes.messages.length > 0) {
      const dbForEmail = getDb();
      const emailState = dbForEmail.notificationState;
      if (!emailState.processedEmailIds) emailState.processedEmailIds = [];

      const cutoffIso =
        emailState.lastEmailCheckedAt || emailState.lastCheckedAt || undefined;
      const cutoffMs = cutoffIso
        ? new Date(cutoffIso).getTime()
        : Date.now() - 10 * 60 * 1000;

      if (!emailState.initializedEmailBaseline) {
        emailState.initializedEmailBaseline = true;
        saveDb(dbForEmail);
      }

      candidateEmails = gmailRes.messages.filter((m) => {
        if (emailState.processedEmailIds?.includes(m.uid)) return false;
        const msgTime = new Date(m.dateIso).getTime();
        return Number.isFinite(msgTime) ? msgTime > cutoffMs : true;
      });
    }
  }

  for (const emailMsg of candidateEmails) {
    const dbForLoop = getDb();
    if (!dbForLoop.notificationState.processedEmailIds) {
      dbForLoop.notificationState.processedEmailIds = [];
    }
    if (!dbForLoop.notificationState.processedEmailIds.includes(emailMsg.uid)) {
      dbForLoop.notificationState.processedEmailIds.push(emailMsg.uid);
      saveDb(dbForLoop);
    }

    const analysis = await analyzeContentWithAI({
      sourceType: "gmail",
      sourceTitle: emailMsg.subject,
      ownerLabel: emailMsg.fromRaw,
      content: emailMsg.bodyText,
      myName,
      myEmail,
      attachments: emailMsg.attachments,
    });

    const { registeredTodos, registeredEvents } =
      await registerExtractedTodosAndSchedules({
        sourceLabel: `[Mail] ${emailMsg.subject}`,
        sourceDocId: `gmail-${emailMsg.uid}`,
        ownerLabel: emailMsg.fromName || emailMsg.fromEmail,
        analysis,
        nowIso,
      });

    const latestDb = getDb();
    const emailNotif: JuniorNotificationItem = {
      id: generateId(),
      type: "gmail_new_message",
      title: `${emailMsg.subject}${
        emailMsg.attachments.length > 0
          ? ` (첨부문서 ${emailMsg.attachments.length}건 포함)`
          : ""
      }`,
      fileId: emailMsg.uid,
      fileName: emailMsg.subject,
      ownerName: emailMsg.fromName || emailMsg.fromEmail,
      ownerEmail: emailMsg.fromEmail,
      summary: analysis.summary,
      attachmentSummaries:
        analysis.attachmentSummaries && analysis.attachmentSummaries.length > 0
          ? analysis.attachmentSummaries
          : emailMsg.attachments.map((att) => ({
              fileName: att.filename,
              mimeType: att.contentType,
              size: att.size,
              summary: summarizeRawText(
                att.extractedText,
                `첨부 문서 '${att.filename}' 핵심 내용 요약`
              ),
            })),
      myTodosRegistered: registeredTodos,
      calendarEventsRegistered: registeredEvents,
      otherPeopleTasks: analysis.otherPeopleTasks.map((o) => ({
        title: o.title || "업무 항목",
        assignee: o.assignee || "담당자 미지정",
        deadline: o.deadline || "기한 미정",
      })),
      read: false,
      createdAt: nowIso,
    };

    latestDb.notifications.unshift(emailNotif);
    saveDb(latestDb);
    createdNotifications.push(emailNotif);
  }

  // Wake up any snoozed email notifications whose snooze time has arrived
  const snoozeDb = getDb();
  let snoozeUpdated = false;
  for (const notif of snoozeDb.notifications || []) {
    if (
      notif.type === "gmail_new_message" &&
      notif.gmailStatus === "snoozed" &&
      notif.snoozedUntil &&
      new Date(notif.snoozedUntil).getTime() <= Date.now()
    ) {
      await unsnoozeGmailMessageToInbox({ subject: notif.fileName });
      notif.gmailStatus = undefined;
      notif.snoozedUntil = undefined;
      notif.snoozeLabel = undefined;
      notif.read = false;
      notif.createdAt = nowIso;
      snoozeUpdated = true;
      createdNotifications.push(notif);
    }
  }
  if (snoozeUpdated) {
    saveDb(snoozeDb);
  }

  const finalDb = getDb();
  finalDb.notificationState.lastCheckedAt = nowIso;
  if (!options?.simulateExternalDoc && !options?.simulateNewEmail) {
    finalDb.notificationState.lastEmailCheckedAt = nowIso;
  }
  saveDb(finalDb);

  return {
    success: true,
    newCount: createdNotifications.length,
    newNotifications: createdNotifications,
    lastCheckedAt: nowIso,
  };
}
