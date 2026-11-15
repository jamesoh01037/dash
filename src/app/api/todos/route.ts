import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb, TodoItem, CalendarEventItem } from "@/lib/db";
import { generateId } from "@/lib/utils";
import {
  buildGoogleCalendarTemplateUrl,
  registerGoogleCalendarEventToJuniorList,
  registerGoogleTaskToJuniorList,
} from "@/lib/googleTasksAndCalendar";

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    todos: db.todos || [],
    calendarEvents: db.calendarEvents || [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const {
      title,
      description,
      priority = "medium",
      dueDate,
      listName = "Junior",
      itemType = "todo",
      location,
    } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const db = getDb();
    const targetList = String(listName || "Junior").trim() || "Junior";
    const nowIso = new Date().toISOString();

    if (itemType === "schedule") {
      const remoteCalLink = await registerGoogleCalendarEventToJuniorList({
        title: title.trim(),
        startTime: dueDate || nowIso,
        location,
        description: description || `[${targetList} 목록] 일정 등록`,
        listName: targetList,
      });
      const calLink =
        remoteCalLink ||
        buildGoogleCalendarTemplateUrl({
          title: title.trim(),
          startTime: dueDate || "",
          description: description || `[${targetList} 목록] 일정`,
          listName: targetList,
        });

      const newEvent: CalendarEventItem = {
        id: generateId(),
        title: title.trim(),
        startTime: dueDate || "일시 미정",
        location,
        description: description?.trim() || `[${targetList} 목록] 등록된 일정`,
        listName: targetList,
        googleCalendarLink: calLink,
        createdAt: nowIso,
      };
      db.calendarEvents = [newEvent, ...(db.calendarEvents || [])];

      const scheduleTodo: TodoItem = {
        id: generateId(),
        title: `📅 [일정] ${title.trim()}`,
        description: description?.trim() || `일시: ${newEvent.startTime}`,
        priority,
        dueDate: newEvent.startTime,
        listName: targetList,
        completed: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.todos = [scheduleTodo, ...(db.todos || [])];
      saveDb(db);

      return NextResponse.json(
        { todo: scheduleTodo, calendarEvent: newEvent },
        { status: 201 }
      );
    }

    const newTodo: TodoItem = {
      id: generateId(),
      title: title.trim(),
      description: description?.trim(),
      priority,
      dueDate,
      listName: targetList,
      completed: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.todos = [newTodo, ...(db.todos || [])];
    saveDb(db);

    await registerGoogleTaskToJuniorList({
      title: newTodo.title,
      notes: newTodo.description,
      dueDate: newTodo.dueDate,
      listName: targetList,
    });

    return NextResponse.json({ todo: newTodo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, completed, title, priority, dueDate, listName } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Todo ID is required" }, { status: 400 });
    }

    const db = getDb();
    const todo = (db.todos || []).find((t) => t.id === id);
    if (!todo) {
      return NextResponse.json({ error: "Todo not found" }, { status: 404 });
    }

    if (completed !== undefined) todo.completed = completed;
    if (title !== undefined) todo.title = title;
    if (priority !== undefined) todo.priority = priority;
    if (dueDate !== undefined) todo.dueDate = dueDate;
    if (listName !== undefined) todo.listName = listName;
    todo.updatedAt = new Date().toISOString();

    saveDb(db);
    return NextResponse.json({ todo });
  } catch {
    return NextResponse.json({ error: "Failed to update todo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type");

    const db = getDb();

    // Support bulk deletion via JSON body: { ids: string[], type?: "todo" | "schedule" }
    if (!id) {
      const body = await req.json().catch(() => null);
      const ids: string[] = Array.isArray(body?.ids)
        ? body.ids.map((v: unknown) => String(v))
        : [];
      const bodyType = body?.type || type;

      if (ids.length === 0) {
        return NextResponse.json({ error: "ID or ids array is required" }, { status: 400 });
      }

      const idSet = new Set(ids);
      if (bodyType === "schedule") {
        db.calendarEvents = (db.calendarEvents || []).filter((e) => !idSet.has(e.id));
      } else {
        db.todos = (db.todos || []).filter((t) => !idSet.has(t.id));
      }
      saveDb(db);
      return NextResponse.json({ success: true, deletedCount: ids.length });
    }

    if (type === "schedule") {
      db.calendarEvents = (db.calendarEvents || []).filter((e) => e.id !== id);
    } else {
      db.todos = (db.todos || []).filter((t) => t.id !== id);
    }
    saveDb(db);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
