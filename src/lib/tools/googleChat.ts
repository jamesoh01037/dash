import {
  listGoogleChatSpaces,
  createGoogleChatSpace,
  listGoogleChatMembers,
  upsertGoogleChatSpace,
  deleteGoogleChatSpace,
  sendGoogleChatMessage,
  updateGoogleChatMessage,
  deleteGoogleChatMessage,
  addGoogleChatReaction,
  getGoogleChatMessages,
} from "../googleChat";

export interface ManageGoogleChatArgs {
  action:
    | "list_spaces"
    | "create_space"
    | "list_members"
    | "send_message"
    | "get_messages"
    | "update_message"
    | "delete_message"
    | "add_reaction"
    | "add_space"
    | "delete_space";
  spaceNameOrId?: string;
  text?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonUrl?: string;
  useCard?: boolean;
  threadName?: string;
  threadKey?: string;
  messageName?: string;
  emoji?: string;
  memberEmails?: string[];
  webhookUrl?: string;
  spaceId?: string;
  description?: string;
  filter?: string;
  maxResults?: number;
  syncFromGmail?: boolean;
}

export async function executeManageGoogleChat(args: ManageGoogleChatArgs) {
  try {
    switch (args.action) {
      case "list_spaces": {
        const { spaces, remoteError } = await listGoogleChatSpaces(true);
        return {
          success: true,
          count: spaces.length,
          spaces,
          message:
            spaces.length > 0
              ? `현재 연결된 Google Chat 스페이스(채팅방/DM) ${spaces.length}개를 확인했습니다.${remoteError ? ` (참고: ${remoteError})` : ""}`
              : "아직 등록된 Google Chat 스페이스가 없습니다. [💬 Google Chat] 탭에서 OAuth 2.0 전체 연동 또는 스페이스 웹훅을 등록해 주세요.",
        };
      }

      case "create_space": {
        const displayName = (args.spaceNameOrId || args.title || "").trim();
        if (!displayName) {
          return {
            success: false,
            error: "생성할 Google Chat 스페이스 이름(spaceNameOrId 또는 title)을 입력해 주세요.",
          };
        }
        const res = await createGoogleChatSpace({
          displayName,
          description: args.description,
          memberEmails: args.memberEmails,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          space: res.space,
          message: `새로운 Google Chat 스페이스 '${res.space?.name}'(${res.space?.spaceId})가 생성되었습니다!`,
        };
      }

      case "list_members": {
        const res = await listGoogleChatMembers(args.spaceNameOrId || args.spaceId);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          space: res.space,
          count: res.members.length,
          members: res.members,
          message: `'${res.space?.name}' 스페이스의 참여 멤버 ${res.members.length}명을 조회했습니다.`,
        };
      }

      case "add_space": {
        const name = (args.spaceNameOrId || args.title || "").trim();
        if (!name) {
          return {
            success: false,
            error: "등록할 Google Chat 스페이스(채팅방) 이름을 입력해 주세요.",
          };
        }
        if (!args.webhookUrl && !args.spaceId) {
          return {
            success: false,
            error: "Google Chat 스페이스의 웹훅 URL(webhookUrl) 또는 스페이스 ID(spaces/...)가 필요합니다.",
          };
        }

        const saved = upsertGoogleChatSpace({
          name,
          webhookUrl: args.webhookUrl,
          spaceId: args.spaceId,
          description: args.description,
        });

        return {
          success: true,
          space: saved,
          message: `Google Chat 스페이스 '${saved.name}' 연동이 완료되었습니다.`,
        };
      }

      case "delete_space": {
        const target = args.spaceNameOrId || args.spaceId || "";
        if (!target) {
          return {
            success: false,
            error: "삭제할 스페이스 이름이나 ID를 지정해 주세요.",
          };
        }
        const removed = deleteGoogleChatSpace(target);
        if (!removed) {
          return {
            success: false,
            error: `'${target}' 스페이스를 찾을 수 없습니다.`,
          };
        }
        return {
          success: true,
          space: removed,
          message: `Google Chat 스페이스 '${removed.name}' 연동이 해제되었습니다.`,
        };
      }

      case "send_message": {
        if (!args.text || !args.text.trim()) {
          return {
            success: false,
            error: "전송할 메시지 본문(text)이 비어 있습니다.",
          };
        }

        const res = await sendGoogleChatMessage({
          spaceNameOrId: args.spaceNameOrId,
          text: args.text,
          title: args.title,
          subtitle: args.subtitle,
          buttonText: args.buttonText,
          buttonUrl: args.buttonUrl,
          threadName: args.threadName,
          threadKey: args.threadKey,
          useCard: args.useCard,
        });

        if (!res.success) {
          return {
            success: false,
            error: res.error,
          };
        }

        return {
          success: true,
          space: res.space,
          messageLog: res.messageLog,
          message: `Google Chat '${res.space?.name}' 스페이스로 메시지를 성공적으로 전송했습니다!`,
        };
      }

      case "update_message": {
        if (!args.messageName || !args.text) {
          return {
            success: false,
            error: "수정할 대상 메시지 ID(messageName: spaces/.../messages/...)와 수정할 내용(text)이 필요합니다.",
          };
        }
        const res = await updateGoogleChatMessage({
          messageName: args.messageName,
          text: args.text,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          message: `Google Chat 메시지(${args.messageName})가 성공적으로 수정되었습니다.`,
        };
      }

      case "delete_message": {
        if (!args.messageName) {
          return {
            success: false,
            error: "삭제할 대상 메시지 ID(messageName: spaces/.../messages/...)가 필요합니다.",
          };
        }
        const res = await deleteGoogleChatMessage(args.messageName);
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          message: `Google Chat 메시지(${args.messageName})가 삭제되었습니다.`,
        };
      }

      case "add_reaction": {
        if (!args.messageName) {
          return {
            success: false,
            error: "리액션을 추가할 메시지 ID(messageName)가 필요합니다.",
          };
        }
        const emoji = args.emoji || "👍";
        const res = await addGoogleChatReaction({
          messageName: args.messageName,
          emoji,
        });
        if (!res.success) {
          return { success: false, error: res.error };
        }
        return {
          success: true,
          message: `메시지(${args.messageName})에 '${emoji}' 리액션을 추가했습니다.`,
        };
      }

      case "get_messages": {
        const res = await getGoogleChatMessages({
          spaceNameOrId: args.spaceNameOrId,
          maxResults: args.maxResults || 20,
          filter: args.filter,
          syncFromGmail: args.syncFromGmail ?? true,
        });

        return {
          success: true,
          count: res.messages.length,
          syncedCount: res.syncedCount,
          messages: res.messages,
          message:
            res.messages.length > 0
              ? `Google Chat 메시지 ${res.messages.length}건을 조회했습니다.${res.syncedCount > 0 ? ` (신규 동기화: ${res.syncedCount}건)` : ""}`
              : "조회된 Google Chat 메시지가 없습니다.",
        };
      }

      default:
        return {
          success: false,
          error: `알 수 없는 Google Chat 작업입니다: ${args.action}`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Chat 처리 중 오류가 발생했습니다.";
    return {
      success: false,
      error: message,
    };
  }
}
