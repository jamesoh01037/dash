import { getDb } from "./db";
import { getValidGoogleDriveToken } from "./googleDrive";
import { withGoogleAuthUser } from "./utils";

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
  const authEmail = getDb().settings?.authUserEmail;
  return withGoogleAuthUser(url.toString(), authEmail);
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
}): Promise<{ synced: boolean; taskId?: string; listName: string; error?: string }> {
  const targetListName = (params.listName || "Junior").trim() || "Junior";
  try {
    const token = await getValidGoogleDriveToken();
    if (!token) {
      return {
        synced: false,
        listName: targetListName,
        error: "Google OAuth 토큰이 만료되었거나 연결되어 있지 않습니다.",
      };
    }

    // 1. Find existing task list named "Junior"
    let targetListId: string | undefined;
    let apiError: string | undefined;
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
    } else {
      const errBody = await listsRes.json().catch(() => null);
      const errMsg = errBody?.error?.message || `HTTP ${listsRes.status}`;
      if (errMsg.includes("has not been used in project") || errMsg.includes("is disabled")) {
        apiError =
          "Google Cloud Console에서 Google Tasks API가 아직 활성화되어 있지 않습니다. (https://console.developers.google.com/apis/api/tasks.googleapis.com/overview?project=131559802832 에서 사용 설정 필요)";
      } else {
        apiError = `Google Tasks API 오류: ${errMsg}`;
      }
      return { synced: false, listName: targetListName, error: apiError };
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
      } else {
        const errBody = await createListRes.json().catch(() => null);
        return {
          synced: false,
          listName: targetListName,
          error: `Google Tasks 목록 생성 실패: ${errBody?.error?.message || createListRes.status}`,
        };
      }
    }

    if (!targetListId) {
      return { synced: false, listName: targetListName, error: "Google Tasks 목록 ID를 확인할 수 없습니다." };
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
export async function registerGoogleCalendarEventWithResult(params: {
  title: string;
  startTime: string;
  fallbackText?: string;
  location?: string;
  description?: string;
  listName?: string;
}): Promise<{ htmlLink?: string; error?: string }> {
  const targetListName = (params.listName || "Junior").trim() || "Junior";
  try {
    const token = await getValidGoogleDriveToken();
    if (!token) {
      return { error: "Google OAuth 토큰이 만료되었거나 연결되어 있지 않습니다." };
    }

    const timeSource =
      params.startTime &&
      !params.startTime.includes("일정 확인 필요") &&
      !params.startTime.includes("일정 미정")
        ? params.startTime
        : `${params.startTime || ""} ${params.fallbackText || ""}`.trim();

    const dateMatch = timeSource.match(
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

    // Parse start/end HH:MM if present (e.g. "14:30~18:00" or "14:30")
    const rangeMatch = timeSource.match(
      /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/
    );
    const singleTimeMatch = !rangeMatch
      ? timeSource.match(/(\d{1,2}):(\d{2})/)
      : null;

    const nextDayStr = (() => {
      const d = new Date(`${dateStr}T00:00:00+09:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

    let eventStart: { date?: string; dateTime?: string; timeZone?: string } = {
      date: dateStr,
    };
    let eventEnd: { date?: string; dateTime?: string; timeZone?: string } = {
      date: nextDayStr,
    };

    if (rangeMatch) {
      const sHour = Number(rangeMatch[1]);
      const sMin = Number(rangeMatch[2]);
      const eHour = Number(rangeMatch[3]);
      const eMin = Number(rangeMatch[4]);
      if (eHour * 60 + eMin <= sHour * 60 + sMin) {
        return {
          error: `종료 시간(${String(eHour).padStart(2, "0")}:${String(eMin).padStart(2, "0")})은 시작 시간(${String(sHour).padStart(2, "0")}:${String(sMin).padStart(2, "0")})보다 이후여야 합니다.`,
        };
      }
      const sH = String(sHour).padStart(2, "0");
      const sM = String(sMin).padStart(2, "0");
      const eH = String(eHour).padStart(2, "0");
      const eM = String(eMin).padStart(2, "0");
      eventStart = {
        dateTime: `${dateStr}T${sH}:${sM}:00+09:00`,
        timeZone: "Asia/Seoul",
      };
      eventEnd = {
        dateTime: `${dateStr}T${eH}:${eM}:00+09:00`,
        timeZone: "Asia/Seoul",
      };
    } else if (singleTimeMatch) {
      const sHour = Number(singleTimeMatch[1]);
      const sMin = Number(singleTimeMatch[2]);
      const endTotalMin = Math.min(23 * 60 + 59, sHour * 60 + sMin + 60);
      const eHour = Math.floor(endTotalMin / 60);
      const eMin = endTotalMin % 60;
      eventStart = {
        dateTime: `${dateStr}T${String(sHour).padStart(2, "0")}:${String(sMin).padStart(2, "0")}:00+09:00`,
        timeZone: "Asia/Seoul",
      };
      eventEnd = {
        dateTime: `${dateStr}T${String(eHour).padStart(2, "0")}:${String(eMin).padStart(2, "0")}:00+09:00`,
        timeZone: "Asia/Seoul",
      };
    }

    // 1. Find existing calendar named `targetListName`
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
    } else {
      const errBody = await calListRes.json().catch(() => null);
      const errMsg = errBody?.error?.message || `HTTP ${calListRes.status}`;
      if (errMsg.includes("has not been used in project") || errMsg.includes("is disabled")) {
        return {
          error:
            "Google Cloud Console에서 Google Calendar API가 아직 활성화되어 있지 않습니다. (https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=131559802832 에서 사용 설정 필요)",
        };
      }
      return { error: `Google Calendar API 오류: ${errMsg}` };
    }

    // 2. Create the calendar if not found
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
          start: eventStart,
          end: eventEnd,
        }),
      }
    );

    if (res.ok) {
      const data = (await res.json()) as { htmlLink?: string };
      return { htmlLink: data.htmlLink };
    }

    const errBody = await res.json().catch(() => null);
    return {
      error: `Google Calendar 일정 등록 실패: ${errBody?.error?.message || res.status}`,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Google Calendar 연동 오류",
    };
  }
}

export async function registerGoogleCalendarEventToJuniorList(params: {
  title: string;
  startTime: string;
  fallbackText?: string;
  location?: string;
  description?: string;
  listName?: string;
}): Promise<string | undefined> {
  const res = await registerGoogleCalendarEventWithResult(params);
  return res.htmlLink;
}
