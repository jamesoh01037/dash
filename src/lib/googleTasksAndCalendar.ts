import { getValidGoogleDriveToken } from "./googleDrive";

export function buildGoogleCalendarTemplateUrl(params: {
  title: string;
  startTime: string;
  description?: string;
  listName?: string;
}): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  const listTag = params.listName || "Junior";
  url.searchParams.set("text", params.title);
  const details = [
    `[목록: ${listTag}]`,
    params.description || "",
  ]
    .filter(Boolean)
    .join("\n");
  url.searchParams.set("details", details);
  return url.toString();
}

/**
 * Finds or creates a Task List named `listName` (default: "Junior") in Google Tasks
 * and inserts the task there.
 */
export async function registerGoogleTaskToJuniorList(params: {
  title: string;
  notes?: string;
  dueDate?: string;
  listName?: string;
}): Promise<{ synced: boolean; taskId?: string; listName: string }> {
  const targetListName = (params.listName || "Junior").trim() || "Junior";
  try {
    const token = await getValidGoogleDriveToken();
    if (!token) {
      return { synced: false, listName: targetListName };
    }

    // 1. Find existing task list named "Junior"
    let targetListId: string | undefined;
    const listsRes = await fetch(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (listsRes.ok) {
      const listsData = (await listsRes.json()) as {
        items?: Array<{ id: string; title: string }>;
      };
      const existing = (listsData.items || []).find(
        (item) => item.title?.trim().toLowerCase() === targetListName.toLowerCase()
      );
      if (existing) {
        targetListId = existing.id;
      }
    }

    // 2. Create the "Junior" task list if it doesn't exist yet
    if (!targetListId) {
      const createListRes = await fetch(
        "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: targetListName }),
        }
      );
      if (createListRes.ok) {
        const createdList = (await createListRes.json()) as { id?: string };
        targetListId = createdList.id;
      }
    }

    if (!targetListId) {
      return { synced: false, listName: targetListName };
    }

    // 3. Parse optional due date into RFC 3339 format if possible
    let rfcDue: string | undefined;
    if (params.dueDate) {
      const dateMatch = params.dueDate.match(
        /(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/
      );
      if (dateMatch) {
        const yyyy = dateMatch[1];
        const mm = dateMatch[2].padStart(2, "0");
        const dd = dateMatch[3].padStart(2, "0");
        rfcDue = `${yyyy}-${mm}-${dd}T09:00:00.000Z`;
      }
    }

    const insertRes = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
        targetListId
      )}/tasks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: params.title,
          notes: params.notes || `[${targetListName} 목록] Junior 자동 등록 할 일`,
          ...(rfcDue ? { due: rfcDue } : {}),
        }),
      }
    );

    if (insertRes.ok) {
      const taskData = (await insertRes.json()) as { id?: string };
      return {
        synced: true,
        taskId: taskData.id,
        listName: targetListName,
      };
    }
  } catch {
    // Fallback to local Junior list
  }

  return { synced: false, listName: targetListName };
}

/**
 * Finds or creates a Calendar named `listName` (default: "Junior") in Google Calendar
 * and inserts the event into that "Junior" calendar list.
 */
export async function registerGoogleCalendarEventToJuniorList(params: {
  title: string;
  startTime: string;
  location?: string;
  description?: string;
  listName?: string;
}): Promise<string | undefined> {
  const targetListName = (params.listName || "Junior").trim() || "Junior";
  try {
    const token = await getValidGoogleDriveToken();
    if (!token) return undefined;

    const dateMatch = params.startTime.match(
      /(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/
    );
    const now = new Date();
    const yyyy = dateMatch ? dateMatch[1] : String(now.getFullYear());
    const mm = dateMatch
      ? dateMatch[2].padStart(2, "0")
      : String(now.getMonth() + 1).padStart(2, "0");
    const dd = dateMatch
      ? dateMatch[3].padStart(2, "0")
      : String(now.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // 1. Find existing calendar named "Junior"
    let targetCalendarId: string | undefined;
    const calListRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (calListRes.ok) {
      const calListData = (await calListRes.json()) as {
        items?: Array<{ id: string; summary: string }>;
      };
      const existing = (calListData.items || []).find(
        (c) => c.summary?.trim().toLowerCase() === targetListName.toLowerCase()
      );
      if (existing) {
        targetCalendarId = existing.id;
      }
    }

    // 2. Create the "Junior" calendar if not found
    if (!targetCalendarId) {
      const createCalRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            summary: targetListName,
            description: "Junior AI 비서가 등록한 일정 목록",
            timeZone: "Asia/Seoul",
          }),
        }
      );
      if (createCalRes.ok) {
        const createdCal = (await createCalRes.json()) as { id?: string };
        targetCalendarId = createdCal.id;
      }
    }

    const calendarIdToUse = targetCalendarId || "primary";

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarIdToUse
      )}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          summary: params.title,
          location: params.location || undefined,
          description: `[목록: ${targetListName}] ${params.description || ""}`.trim(),
          start: { date: dateStr },
          end: { date: dateStr },
        }),
      }
    );

    if (res.ok) {
      const data = (await res.json()) as { htmlLink?: string };
      return data.htmlLink;
    }
  } catch {
    // Fallback to local calendar + template link
  }
  return undefined;
}
