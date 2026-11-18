import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  fetchGmailMessageAttachmentsByUid,
  getGmailCredentials,
  sendGmailMessage,
} from "@/lib/gmail";
import { uploadBufferToGoogleDrive } from "@/lib/googleDrive";
import {
  listOrSearchContacts,
  searchContactsWithPeopleApi,
} from "@/lib/contacts";
import {
  findOrCreateGoogleChatDmSpace,
  listGoogleChatSpaces,
  sendGoogleChatMessage,
} from "@/lib/googleChat";

interface SharedAttachmentInfo {
  fileName: string;
  mimeType: string;
  summary: string;
  driveUrl?: string;
}

export async function GET(req: NextRequest) {
  try {
    const notificationId = req.nextUrl.searchParams.get("notificationId");
    const query = req.nextUrl.searchParams.get("q");

    // 1. Live organization / contact email search mode
    if (query !== null && !notificationId) {
      const trimmed = query.trim();
      if (trimmed) {
        await searchContactsWithPeopleApi(trimmed).catch(() => null);
      }
      const contacts = listOrSearchContacts(trimmed || undefined).filter(
        (c) => Boolean(c.email?.trim())
      );
      return NextResponse.json({
        contacts: contacts.slice(0, 20).map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email!,
          organization: c.company || c.department || "",
        })),
      });
    }

    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId 또는 q 파라미터가 필요합니다." },
        { status: 400 }
      );
    }

    const db = getDb();
    const notif = (db.notifications || []).find((n) => n.id === notificationId);
    if (!notif) {
      return NextResponse.json(
        { error: "해당 알림을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const { email: myEmail } = getGmailCredentials();
    const domain =
      myEmail && myEmail.includes("@") ? myEmail.split("@")[1] : undefined;
    const orgName = db.settings?.authUserOrg?.trim();
    const orgKeyword = orgName || domain || "";

    // 2. Search organization directory & contacts for auto-fill
    if (orgKeyword) {
      await searchContactsWithPeopleApi(orgKeyword).catch(() => null);
    }
    for (const task of notif.otherPeopleTasks || []) {
      const assigneeName = task.assignee?.trim();
      if (assigneeName && assigneeName !== "미지정") {
        await searchContactsWithPeopleApi(assigneeName).catch(() => null);
      }
    }

    const allContactsWithEmail = listOrSearchContacts().filter((c) =>
      Boolean(c.email?.trim())
    );

    const orgContacts = allContactsWithEmail.filter((c) => {
      if (domain && c.email?.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
        return true;
      }
      if (
        orgName &&
        c.company?.toLowerCase().includes(orgName.toLowerCase())
      ) {
        return true;
      }
      return false;
    });

    const pool = orgContacts.length > 0 ? orgContacts : allContactsWithEmail;

    // Auto-fill To: match assignees from otherPeopleTasks in org contacts
    const toEmailsSet = new Set<string>();
    for (const task of notif.otherPeopleTasks || []) {
      const assignee = (task.assignee || "").trim().toLowerCase();
      if (!assignee || assignee === "미지정") continue;
      if (assignee.includes("@")) {
        toEmailsSet.add(assignee);
        continue;
      }
      const matched = pool.find(
        (c) =>
          c.name.toLowerCase().includes(assignee) ||
          assignee.includes(c.name.toLowerCase()) ||
          c.email?.toLowerCase().includes(assignee)
      );
      if (matched?.email) {
        toEmailsSet.add(matched.email);
      }
    }

    // Auto-fill Cc: organization colleagues excluding self and To recipients
    const ccEmailsSet = new Set<string>();
    if (
      notif.ownerEmail &&
      (!domain ||
        notif.ownerEmail.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) &&
      notif.ownerEmail.toLowerCase() !== myEmail?.toLowerCase() &&
      !toEmailsSet.has(notif.ownerEmail.toLowerCase())
    ) {
      ccEmailsSet.add(notif.ownerEmail);
    }
    for (const c of orgContacts) {
      if (!c.email) continue;
      const lower = c.email.toLowerCase();
      if (myEmail && lower === myEmail.toLowerCase()) continue;
      if (toEmailsSet.has(lower)) continue;
      ccEmailsSet.add(c.email);
      if (ccEmailsSet.size >= 5) break;
    }

    // 3. Upload email attachments to Google Drive & collect URLs (cached per notification)
    const attachments: SharedAttachmentInfo[] = [];
    const existingSummaries = notif.attachmentSummaries || [];

    if (existingSummaries.length > 0) {
      const cachedUrls = (
        notif as unknown as { sharedDriveUrls?: Record<string, string> }
      ).sharedDriveUrls;
      const nextCache: Record<string, string> = { ...(cachedUrls || {}) };

      const needsUpload = existingSummaries.some((a) => !nextCache[a.fileName]);
      let fetchedAttachments: Array<{
        filename: string;
        contentType: string;
        size: number;
        content: Buffer;
      }> = [];

      if (needsUpload && notif.type === "gmail_new_message" && notif.fileId) {
        const fetched = await fetchGmailMessageAttachmentsByUid(notif.fileId);
        if (fetched.success) {
          fetchedAttachments = fetched.attachments;
        }
      }

      for (const attSummary of existingSummaries) {
        let driveUrl = nextCache[attSummary.fileName];
        if (!driveUrl) {
          const matchedBin = fetchedAttachments.find(
            (b) =>
              b.filename.toLowerCase() === attSummary.fileName.toLowerCase()
          );
          if (matchedBin && matchedBin.content.length > 0) {
            const uploaded = await uploadBufferToGoogleDrive({
              name: matchedBin.filename,
              mimeType: matchedBin.contentType || attSummary.mimeType,
              buffer: matchedBin.content,
              description: `[${notif.fileName}] 업무 공유 첨부파일`,
            });
            if (uploaded.success && uploaded.webViewLink) {
              driveUrl = uploaded.webViewLink;
              nextCache[attSummary.fileName] = driveUrl;
            }
          } else if (notif.fileWebViewLink) {
            driveUrl = notif.fileWebViewLink;
          }
        }
        attachments.push({
          fileName: attSummary.fileName,
          mimeType: attSummary.mimeType,
          summary: attSummary.summary,
          driveUrl,
        });
      }

      if (Object.keys(nextCache).length > 0) {
        (
          notif as unknown as { sharedDriveUrls?: Record<string, string> }
        ).sharedDriveUrls = nextCache;
        saveDb(db);
      }
    }

    // 4. Load Google Chat group spaces (exclude raw 1:1 DM IDs from the Space dropdown)
    const chatRes = await listGoogleChatSpaces(false).catch(() => ({
      spaces: [],
    }));
    const groupSpaces = chatRes.spaces.filter(
      (s) =>
        s.spaceType !== "DIRECT_MESSAGE" &&
        !s.name.startsWith("1:1 DM (")
    );

    return NextResponse.json({
      notification: {
        id: notif.id,
        fileName: notif.fileName,
        summary: notif.summary,
        ownerName: notif.ownerName,
        ownerEmail: notif.ownerEmail,
        fileWebViewLink: notif.fileWebViewLink,
      },
      autoFill: {
        to: Array.from(toEmailsSet),
        cc: Array.from(ccEmailsSet),
      },
      orgContacts: pool.slice(0, 30).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email!,
        organization: c.company || c.department || "",
      })),
      attachments,
      chatSpaces: groupSpaces.map((s) => ({
        id: s.id,
        name: s.name,
        spaceId: s.spaceId,
        spaceType: s.spaceType,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "공유 정보 준비 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === "send_mail") {
      const to = String(body.to || "").trim();
      const cc = String(body.cc || "").trim();
      const subject = String(body.subject || "").trim();
      const mailBody = String(body.body || "").trim();

      if (!to) {
        return NextResponse.json(
          { error: "수신자 이메일을 입력해 주세요." },
          { status: 400 }
        );
      }
      if (!subject || !mailBody) {
        return NextResponse.json(
          { error: "제목과 본문을 입력해 주세요." },
          { status: 400 }
        );
      }

      const res = await sendGmailMessage(to, subject, mailBody, cc || undefined);
      if (!res.success) {
        return NextResponse.json(
          { error: res.error || "메일 발송에 실패했습니다." },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        messageId: res.messageId,
      });
    }

    if (action === "send_chat") {
      const targetType = body.targetType as "space" | "person";
      let spaceNameOrId = String(body.spaceId || "").trim();
      const personEmail = String(body.personEmail || "").trim();
      const personName = String(body.personName || "").trim();
      const title = String(body.title || "").trim();
      const text = String(body.text || "").trim();
      const buttonUrl = body.buttonUrl ? String(body.buttonUrl).trim() : undefined;

      if (!title && !text) {
        return NextResponse.json(
          { error: "공유할 내용이 비어 있습니다." },
          { status: 400 }
        );
      }

      if (targetType === "person") {
        if (!personEmail) {
          return NextResponse.json(
            { error: "채팅을 보낼 대상자를 선택해 주세요." },
            { status: 400 }
          );
        }
        const dmRes = await findOrCreateGoogleChatDmSpace({
          email: personEmail,
          displayName: personName || personEmail,
        });
        if (!dmRes.success || !dmRes.space) {
          return NextResponse.json(
            { error: dmRes.error || "1:1 채팅방을 열 수 없습니다." },
            { status: 400 }
          );
        }
        spaceNameOrId = dmRes.space.spaceId || dmRes.space.id;
      }

      if (!spaceNameOrId) {
        return NextResponse.json(
          { error: "채팅을 보낼 스페이스 또는 사람을 선택해 주세요." },
          { status: 400 }
        );
      }

      // Send as a single box (card first; fallback to formatted single text block if cardsV2 is rejected under user OAuth)
      let chatRes = await sendGoogleChatMessage({
        spaceNameOrId,
        title,
        subtitle: "업무 정보 공유",
        text,
        useCard: true,
        buttonUrl,
        buttonText: buttonUrl ? "Google Drive 첨부 문서 열기" : undefined,
      });

      if (!chatRes.success) {
        const plainBoxText = `${title}\n${text}`;
        chatRes = await sendGoogleChatMessage({
          spaceNameOrId,
          text: plainBoxText,
          useCard: false,
        });
      }

      if (!chatRes.success) {
        return NextResponse.json(
          { error: chatRes.error || "Google Chat 전송에 실패했습니다." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        space: chatRes.space,
      });
    }

    return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "업무 공유 처리 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
