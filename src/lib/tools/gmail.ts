import {
  listGmailMessages,
  getGmailMessageDetails,
  createGmailDraft,
  sendGmailMessage,
  getGmailCredentials,
} from "../gmail";

export interface ManageGmailArgs {
  action: "list" | "read" | "draft" | "send" | "detect_schedule";
  query?: string;
  emailId?: string;
  to?: string;
  subject?: string;
  body?: string;
  maxResults?: number;
}

export async function executeManageGmail(args: ManageGmailArgs) {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return {
      success: false,
      error:
        "Gmail 계정이 아직 연동되지 않았습니다. 좌측 사이드바의 [Gmail 메일함] 또는 우측 상단 [설정]에서 Gmail 주소와 16자리 앱 비밀번호를 등록해 주세요.",
    };
  }

  switch (args.action) {
    case "list": {
      const q = args.query || "is:unread";
      const max = args.maxResults || 5;
      const res = await listGmailMessages(q, max);
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return {
        success: true,
        query: q,
        total: res.messages?.length || 0,
        messages: res.messages,
      };
    }

    case "read": {
      if (!args.emailId) {
        return { success: false, error: "읽을 이메일의 ID(emailId)가 필요합니다." };
      }
      const res = await getGmailMessageDetails(args.emailId);
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return {
        success: true,
        email: res.email,
      };
    }

    case "draft": {
      if (!args.to || !args.subject || !args.body) {
        return {
          success: false,
          error: "초안 작성을 위해 수신자(to), 제목(subject), 본문(body)이 필요합니다.",
        };
      }
      const res = await createGmailDraft(args.to, args.subject, args.body);
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return {
        success: true,
        message: `Gmail에 "${args.subject}" 메일 초안(Draft)이 성공적으로 저장되었습니다. 메일함에서 검토 후 전송하실 수 있습니다.`,
        draftId: res.draftId,
      };
    }

    case "send": {
      if (!args.to || !args.subject || !args.body) {
        return {
          success: false,
          error: "메일 발송을 위해 수신자(to), 제목(subject), 본문(body)이 필요합니다.",
        };
      }
      const res = await sendGmailMessage(args.to, args.subject, args.body);
      if (!res.success) {
        return { success: false, error: res.error };
      }
      return {
        success: true,
        message: `"${args.to}"님께 "${args.subject}" 메일을 성공적으로 발송했습니다! 🚀`,
        messageId: res.messageId,
      };
    }

    case "detect_schedule": {
      let contentToAnalyze = "";
      let emailSubject = "";
      let emailFrom = "";

      if (args.emailId) {
        const detail = await getGmailMessageDetails(args.emailId);
        if (!detail.success || !detail.email) {
          return { success: false, error: detail.error || "메일을 불러오지 못했습니다." };
        }
        contentToAnalyze = detail.email.body;
        emailSubject = detail.email.subject;
        emailFrom = detail.email.from;
      } else {
        // Scan latest unread
        const list = await listGmailMessages("is:unread", 5);
        if (!list.success || !list.messages || list.messages.length === 0) {
          return { success: true, message: "검사할 읽지 않은 새 메일이 없습니다.", detectedEvents: [] };
        }
        contentToAnalyze = list.messages.map((m) => `[제목: ${m.subject} | 보낸이: ${m.from}]\n${m.snippet}`).join("\n\n");
      }

      // Return content for LLM agent to parse schedule and confirm with user
      return {
        success: true,
        message: "메일 본문에서 회의/일정 관련 내용을 추출했습니다. 확인 후 사용자에게 일정 등록 여부를 질문하세요.",
        emailSubject,
        emailFrom,
        content: contentToAnalyze.slice(0, 2000),
      };
    }

    default:
      return { success: false, error: `지원하지 않는 Gmail 작업입니다: ${args.action}` };
  }
}
