import { getDb, saveDb, TodoItem, CalendarEventItem } from "../db";
import { generateId } from "../utils";
import {
  buildGoogleCalendarTemplateUrl,
  registerGoogleCalendarEventToJuniorList,
  registerGoogleTaskToJuniorList,
} from "../googleTasksAndCalendar";

export interface ManageTodoArgs {
  action: "add" | "list" | "complete" | "delete" | "add_schedule";
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  listName?: string;
  itemType?: "todo" | "schedule";
  location?: string;
  todoId?: string;
}

export async function executeManageTodos(args: ManageTodoArgs) {
  const db = getDb();
  const todos = db.todos || [];
  const calendarEvents = db.calendarEvents || [];
  const targetListName = (args.listName || "Junior").trim() || "Junior";

  switch (args.action) {
    case "add":
    case "add_schedule": {
      if (!args.title) {
        return { success: false, error: "할 일 또는 일정 제목(title)이 필요합니다." };
      }

      const cleanTitle = args.title.trim();
      const nowIso = new Date().toISOString();
      const isSchedule =
        args.action === "add_schedule" ||
        args.itemType === "schedule" ||
        /(일정|회의|미팅|약속|발표|세미나|면담|킥오프|캘린더)/.test(cleanTitle);

      const newTodo: TodoItem = {
        id: generateId(),
        title: cleanTitle,
        description:
          args.description?.trim() || `[${targetListName} 목록] Junior 등록 항목`,
        priority: args.priority || "medium",
        dueDate: args.dueDate,
        listName: targetListName,
        completed: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      todos.unshift(newTodo);
      db.todos = todos;

      await registerGoogleTaskToJuniorList({
        title: newTodo.title,
        notes: newTodo.description,
        dueDate: newTodo.dueDate,
        listName: targetListName,
      });

      let createdEvent: CalendarEventItem | undefined;
      if (isSchedule) {
        const remoteCalLink = await registerGoogleCalendarEventToJuniorList({
          title: cleanTitle,
          startTime: args.dueDate || nowIso,
          location: args.location,
          description: args.description || `Junior가 "${targetListName}" 목록에 등록한 일정`,
          listName: targetListName,
        });
        const calLink =
          remoteCalLink ||
          buildGoogleCalendarTemplateUrl({
            title: cleanTitle,
            startTime: args.dueDate || "",
            description: args.description || `Junior "${targetListName}" 목록 일정`,
            listName: targetListName,
          });

        createdEvent = {
          id: generateId(),
          title: cleanTitle,
          startTime: args.dueDate || "일시 미정",
          location: args.location,
          description: args.description || `Junior "${targetListName}" 목록 등록 일정`,
          listName: targetListName,
          googleCalendarLink: calLink,
          createdAt: nowIso,
        };
        calendarEvents.unshift(createdEvent);
        db.calendarEvents = calendarEvents;
      }

      saveDb(db);

      if (isSchedule && createdEvent) {
        return {
          success: true,
          message: `일정 및 할 일의 "${targetListName}" 목록에 "${newTodo.title}"이(가) 등록되었습니다.`,
          listName: targetListName,
          todo: newTodo,
          calendarEvent: createdEvent,
        };
      }

      return {
        success: true,
        message: `할 일의 "${targetListName}" 목록에 "${newTodo.title}"이(가) 등록되었습니다.`,
        listName: targetListName,
        todo: newTodo,
      };
    }

    case "list": {
      const filteredTodos = args.listName
        ? todos.filter(
            (t) => (t.listName || "Junior").toLowerCase() === targetListName.toLowerCase()
          )
        : todos;
      const filteredEvents = args.listName
        ? calendarEvents.filter(
            (e) => (e.listName || "Junior").toLowerCase() === targetListName.toLowerCase()
          )
        : calendarEvents;

      return {
        success: true,
        listName: targetListName,
        total: filteredTodos.length,
        todos: filteredTodos,
        calendarEvents: filteredEvents,
      };
    }

    case "complete": {
      const targetId = args.todoId?.trim();
      if (!targetId) {
        return { success: false, error: "완료 처리할 할 일의 ID 또는 제목이 필요합니다." };
      }
      const todo = todos.find(
        (t) => t.id === targetId || t.title.toLowerCase().includes(targetId.toLowerCase())
      );
      if (!todo) {
        return { success: false, error: `일치하는 할 일을 찾을 수 없습니다: ${targetId}` };
      }
      todo.completed = true;
      todo.updatedAt = new Date().toISOString();
      saveDb(db);
      return {
        success: true,
        message: `"${todo.listName || "Junior"}" 목록의 "${todo.title}" 할 일을 완료 처리했습니다! 🎉`,
        todo,
      };
    }

    case "delete": {
      const targetId = args.todoId?.trim();
      if (!targetId) {
        return { success: false, error: "삭제할 할 일의 ID 또는 제목이 필요합니다." };
      }
      const initialLength = todos.length;
      const filtered = todos.filter(
        (t) => t.id !== targetId && !t.title.toLowerCase().includes(targetId.toLowerCase())
      );
      const filteredCal = calendarEvents.filter(
        (e) => e.id !== targetId && !e.title.toLowerCase().includes(targetId.toLowerCase())
      );
      if (filtered.length === initialLength && filteredCal.length === calendarEvents.length) {
        return { success: false, error: `삭제할 항목을 찾지 못했습니다: ${targetId}` };
      }
      db.todos = filtered;
      db.calendarEvents = filteredCal;
      saveDb(db);
      return {
        success: true,
        message: `항목이 삭제되었습니다.`,
      };
    }

    default:
      return { success: false, error: `지원하지 않는 작업입니다: ${args.action}` };
  }
}
