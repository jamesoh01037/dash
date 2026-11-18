import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb, TodoItem, CalendarEventItem } from "@/lib/db";
import { generateId } from "@/lib/utils";
import {
  buildGoogleCalendarTemplateUrl,
  registerGoogleCalendarEventToJuniorList,
  registerGoogleCalendarEventWithResult,
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
    const body = await req.json();
    const {
      action,
      id,
      title,
      description,
      priority = "medium",
      dueDate,
      startTime,
      listName,
      itemType = "todo",
      location,
    } = body;

    const db = getDb();
    const assistantName = db.settings?.assistantName?.trim() || "Junior";
    const nowIso = new Date().toISOString();

    if (action === "register_google_task") {
      if (!id) {
        return NextResponse.json({ error: "Todo ID is required" }, { status: 400 });
      }
      const todo = (db.todos || []).find((t) => t.id === id);
      if (!todo && (!title || !String(title).trim())) {
        return NextResponse.json({ error: "할 일 항목을 찾을 수 없습니다." }, { status: 404 });
      }
      const finalTitle =
        typeof title === "string" && title.trim() ? title.trim() : todo!.title;
      const finalNotes =
        typeof description === "string" ? description.trim() : todo?.description;
      const finalDue =
        typeof dueDate === "string" ? dueDate.trim() || undefined : todo?.dueDate;
      const targetList = assistantName;
      const result = await registerGoogleTaskToJuniorList({
        title: finalTitle,
        notes: finalNotes,
        dueDate: finalDue,
        listName: targetList,
      });

      if (!result.synced) {
        return NextResponse.json(
          {
            error:
              result.error ||
              "Google Tasks에 등록하지 못했습니다. Google 계정 연동(Tasks 권한)을 확인해 주세요.",
          },
          { status: 400 }
        );
      }

      if (todo) {
        todo.title = finalTitle;
        if (finalNotes !== undefined) todo.description = finalNotes;
        if (finalDue !== undefined) todo.dueDate = finalDue;
        todo.googleTaskId = result.taskId || "synced";
        todo.googleTaskSyncedAt = nowIso;
        todo.googleTaskListName = result.listName || targetList;
        todo.listName = result.listName || targetList;
        todo.updatedAt = nowIso;
        saveDb(db);
      }

      return NextResponse.json({
        success: true,
        todo,
        listName: result.listName || targetList,
      });
    }

    if (action === "register_google_calendar") {
      if (!id) {
        return NextResponse.json({ error: "Schedule ID is required" }, { status: 400 });
      }
      const ev = (db.calendarEvents || []).find((e) => e.id === id);
      if (!ev && (!title || !String(title).trim())) {
        return NextResponse.json({ error: "일정 항목을 찾을 수 없습니다." }, { status: 404 });
      }
      const targetList = assistantName;
      const cleanSourceTitle = ev
        ? (ev.sourceDocName || "")
            .replace(/^\[(Mail|Drive|메일)\]\s*/i, "")
            .trim() || ev.title
        : String(title).trim();
      const finalTitle =
        typeof title === "string" && title.trim() ? title.trim() : cleanSourceTitle;
      const finalStartTime =
        typeof startTime === "string" && startTime.trim()
          ? startTime.trim()
          : ev?.startTime || nowIso;
      const finalLocation =
        typeof location === "string" ? location.trim() || undefined : ev?.location;
      const finalDescription =
        typeof description === "string"
          ? description.trim()
          : ev?.description || `출처: ${ev?.sourceDocName || "확인필요사항"}`;

      const calRes = await registerGoogleCalendarEventWithResult({
        title: finalTitle,
        startTime: finalStartTime,
        fallbackText: ev ? `${ev.title} ${ev.description || ""}` : finalTitle,
        location: finalLocation,
        description: finalDescription,
        listName: targetList,
      });

      if (!calRes.htmlLink) {
        return NextResponse.json(
          {
            error:
              calRes.error ||
              "Google Calendar에 등록하지 못했습니다. Google 계정 연동(Calendar 권한)을 확인해 주세요.",
          },
          { status: 400 }
        );
      }

      if (ev) {
        ev.startTime = finalStartTime;
        if (finalLocation !== undefined) ev.location = finalLocation;
        if (finalDescription) ev.description = finalDescription;
        ev.googleCalendarLink = calRes.htmlLink;
        ev.googleCalendarSyncedAt = nowIso;
        ev.listName = targetList;
        saveDb(db);
      }

      return NextResponse.json({
        success: true,
        calendarEvent: ev || {
          id,
          title: finalTitle,
          startTime: finalStartTime,
          location: finalLocation,
          description: finalDescription,
          googleCalendarLink: calRes.htmlLink,
          googleCalendarSyncedAt: nowIso,
          listName: targetList,
        },
        listName: targetList,
      });
    }

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const targetList = String(listName || assistantName).trim() || assistantName;

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
