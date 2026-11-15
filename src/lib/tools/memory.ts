import { getDb, saveDb, MemoryItem } from "../db";
import { generateId } from "../utils";

export interface ManageMemoryArgs {
  action: "save" | "list" | "delete";
  content?: string;
  category?: "personal" | "preference" | "work" | "general";
  memoryId?: string;
}

export function executeManageMemory(args: ManageMemoryArgs) {
  const db = getDb();
  const memories = db.memories || [];

  switch (args.action) {
    case "save": {
      if (!args.content) {
        return { success: false, error: "기억할 내용(content)이 필요합니다." };
      }
      const newMemory: MemoryItem = {
        id: generateId(),
        category: args.category || "general",
        content: args.content.trim(),
        source: "extracted_by_agent",
        createdAt: new Date().toISOString(),
      };
      memories.push(newMemory);
      db.memories = memories;
      saveDb(db);
      return {
        success: true,
        message: `새로운 기억을 저장했습니다: "${newMemory.content}"`,
        memory: newMemory,
      };
    }

    case "list": {
      return {
        success: true,
        total: memories.length,
        memories,
      };
    }

    case "delete": {
      const targetId = args.memoryId?.trim();
      if (!targetId) {
        return { success: false, error: "삭제할 기억의 ID가 필요합니다." };
      }
      const initialLength = memories.length;
      const filtered = memories.filter((m) => m.id !== targetId);
      if (filtered.length === initialLength) {
        return { success: false, error: `해당 ID의 기억을 찾지 못했습니다: ${targetId}` };
      }
      db.memories = filtered;
      saveDb(db);
      return {
        success: true,
        message: "기억이 삭제되었습니다.",
      };
    }

    default:
      return { success: false, error: `지원하지 않는 작업입니다: ${args.action}` };
  }
}
