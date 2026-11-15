import { searchWeb } from "./search";
import { executeManageTodos, ManageTodoArgs } from "./todos";
import { executeManageMemory, ManageMemoryArgs } from "./memory";
import { executeManageGmail, ManageGmailArgs } from "./gmail";
import { executeManageContacts, ManageContactsArgs } from "./contacts";
import { executeManageGoogleChat, ManageGoogleChatArgs } from "./googleChat";
import { executeManageGoogleDrive, ManageGoogleDriveArgs } from "./googleDrive";

export interface ToolExecutionResponse {
  toolName: string;
  result: unknown;
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResponse> {
  switch (name) {
    case "search_web": {
      const query = String(args.query || "");
      const searchRes = await searchWeb(query);
      return { toolName: name, result: searchRes };
    }

    case "manage_todos": {
      const todoRes = await executeManageTodos(args as unknown as ManageTodoArgs);
      return { toolName: name, result: todoRes };
    }

    case "manage_memory": {
      const memRes = executeManageMemory(args as unknown as ManageMemoryArgs);
      return { toolName: name, result: memRes };
    }

    case "manage_gmail": {
      const gmailRes = await executeManageGmail(args as unknown as ManageGmailArgs);
      return { toolName: name, result: gmailRes };
    }

    case "manage_contacts": {
      const contactsRes = await executeManageContacts(args as unknown as ManageContactsArgs);
      return { toolName: name, result: contactsRes };
    }

    case "manage_google_chat": {
      const chatRes = await executeManageGoogleChat(args as unknown as ManageGoogleChatArgs);
      return { toolName: name, result: chatRes };
    }

    case "manage_google_drive": {
      const driveRes = await executeManageGoogleDrive(args as unknown as ManageGoogleDriveArgs);
      return { toolName: name, result: driveRes };
    }

    default:
      return {
        toolName: name,
        result: { error: `알 수 없는 도구 호출입니다: ${name}` },
      };
  }
}
