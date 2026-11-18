import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb, DatabaseSchema, JuniorNotificationItem } from "@/lib/db";
import { checkJuniorNotifications } from "@/lib/notifications";
import {
  performGmailImapAction,
  performBatchGmailImapActions,
  GmailImapActionType,
} from "@/lib/gmail";

function removeDetectedCandidatesForNotifications(
  db: DatabaseSchema,
  removedNotifs: JuniorNotificationItem[]
) {
  if (removedNotifs.length === 0) return;
  const todoIds = new Set<string>();
  const eventIds = new Set<string>();
  for (const n of removedNotifs) {
    for (const t of n.myTodosRegistered || []) {
      if (t.id) todoIds.add(t.id);
    }
    for (const e of n.calendarEventsRegistered || []) {
      if (e.id) eventIds.add(e.id);
    }
  }
  if (todoIds.size > 0 && Array.isArray(db.todos)) {
    db.todos = db.todos.filter((t) => !todoIds.has(t.id));
  }
  if (eventIds.size > 0 && Array.isArray(db.calendarEvents)) {
    db.calendarEvents = db.calendarEvents.filter((e) => !eventIds.has(e.id));
  }
}

export async function GET() {
  try {
    const db = getDb();
    const notifications = db.notifications || [];
    const unreadCount = notifications.filter((n) => !n.read).length;

    return NextResponse.json({
      notifications,
      unreadCount,
      todos: db.todos || [],
      calendarEvents: db.calendarEvents || [],
      assistantName: db.settings?.assistantName?.trim() || "Junior",
      notificationState: db.notificationState || {
        enabled: true,
        intervalMinutes: 5,
        initializedBaseline: false,
        processedDriveFileIds: [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Junior 알림 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "check_now";

    if (action === "check_now") {
      if (body.stream === true) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            };

            try {
              const checkRes = await checkJuniorNotifications({
                simulateExternalDoc: Boolean(body.simulate),
                simulateNewEmail: Boolean(body.simulateEmail),
                onProgress: (phase, message) => {
                  sendEvent("progress", { phase, message });
                },
                onNotificationCreated: (notification) => {
                  sendEvent("notification", { notification });
                },
              });

              const db = getDb();
              const notifications = db.notifications || [];
              const unreadCount = notifications.filter((n) => !n.read).length;

              sendEvent("done", {
                success: true,
                newCount: checkRes.newCount,
                notifications,
                unreadCount,
                todos: db.todos || [],
                calendarEvents: db.calendarEvents || [],
                notificationState: db.notificationState,
              });
            } catch (err) {
              const msg =
                err instanceof Error ? err.message : "즉시 체크 중 오류가 발생했습니다.";
              sendEvent("error", { error: msg });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      }

      const checkRes = await checkJuniorNotifications({
        simulateExternalDoc: Boolean(body.simulate),
        simulateNewEmail: Boolean(body.simulateEmail),
      });
      const db = getDb();
      const notifications = db.notifications || [];
      const unreadCount = notifications.filter((n) => !n.read).length;

      return NextResponse.json({
        success: true,
        newCount: checkRes.newCount,
        newNotifications: checkRes.newNotifications,
        notifications,
        unreadCount,
        todos: db.todos || [],
        calendarEvents: db.calendarEvents || [],
        notificationState: db.notificationState,
      });
    }

    if (action === "mark_read") {
      const db = getDb();
      if (!db.notifications) db.notifications = [];

      if (body.all) {
        db.notifications = db.notifications.map((n) => ({ ...n, read: true }));
      } else if (body.id) {
        const target = db.notifications.find((n) => n.id === body.id);
        if (target && target.type === "gmail_new_message" && target.fileId) {
          await performGmailImapAction({
            emailUid: target.fileId,
            subject: target.fileName,
            action: "mark_read",
          });
        }
        db.notifications = db.notifications.map((n) =>
          n.id === body.id ? { ...n, read: true } : n
        );
      }
      saveDb(db);

      const unreadCount = db.notifications.filter((n) => !n.read).length;
      return NextResponse.json({
        success: true,
        notifications: db.notifications,
        unreadCount,
      });
    }

    if (action === "gmail_action") {
      const id = String(body.id || "");
      const gmailAction = String(body.gmailAction || "") as GmailImapActionType;
      const snoozeUntil = body.snoozeUntil ? String(body.snoozeUntil) : undefined;
      const snoozeLabel = body.snoozeLabel ? String(body.snoozeLabel) : undefined;

      const db = getDb();
      if (!db.notifications) db.notifications = [];

      const target = db.notifications.find((n) => n.id === id);
      if (!target) {
        return NextResponse.json(
          { error: "해당 알림을 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      const gmailResult = await performGmailImapAction({
        emailUid: target.fileId,
        action: gmailAction,
        snoozeLabel,
      });

      if (gmailAction === "spam" || gmailAction === "trash") {
        removeDetectedCandidatesForNotifications(db, [target]);
        db.notifications = db.notifications.filter((n) => n.id !== id);
      } else if (gmailAction === "archive") {
        db.notifications = db.notifications.map((n) =>
          n.id === id
            ? {
                ...n,
                read: true,
                gmailStatus: "archived",
                snoozedUntil: undefined,
                snoozeLabel: undefined,
              }
            : n
        );
      } else if (gmailAction === "snooze") {
        db.notifications = db.notifications.map((n) =>
          n.id === id
            ? {
                ...n,
                read: true,
                gmailStatus: "snoozed",
                snoozedUntil:
                  snoozeUntil ||
                  new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                snoozeLabel: snoozeLabel || "1시간 뒤",
              }
            : n
        );
      }

      saveDb(db);

      return NextResponse.json({
        success: true,
        gmailResult,
        notifications: db.notifications,
        unreadCount: db.notifications.filter((n) => !n.read).length,
      });
    }

    if (action === "gmail_batch_action") {
      const queue = Array.isArray(body.queue)
        ? (body.queue as Array<{
            id: string;
            gmailAction: GmailImapActionType;
            snoozeUntil?: string;
            snoozeLabel?: string;
          }>)
        : [];

      const db = getDb();
      if (!db.notifications) db.notifications = [];

      const imapBatchItems = [];
      for (const qItem of queue) {
        const target = db.notifications.find((n) => n.id === qItem.id);
        if (target && target.type === "gmail_new_message" && target.fileId) {
          imapBatchItems.push({
            emailUid: target.fileId,
            subject: target.fileName,
            action: qItem.gmailAction,
            snoozeLabel: qItem.snoozeLabel,
          });
        }
      }

      // Apply all queued actions to db.notifications immediately,
      // and execute Gmail IMAP sync in the background so UI returns right away.
      const removeIds = new Set<string>();
      const updateMap = new Map<
        string,
        {
          gmailAction: GmailImapActionType;
          snoozeUntil?: string;
          snoozeLabel?: string;
        }
      >();

      for (const qItem of queue) {
        if (qItem.gmailAction === "spam" || qItem.gmailAction === "trash") {
          removeIds.add(qItem.id);
        } else {
          updateMap.set(qItem.id, qItem);
        }
      }

      const removedNotifs = db.notifications.filter((n) => removeIds.has(n.id));
      removeDetectedCandidatesForNotifications(db, removedNotifs);

      db.notifications = db.notifications
        .filter((n) => !removeIds.has(n.id))
        .map((n) => {
          const upd = updateMap.get(n.id);
          if (!upd) return n;
          if (upd.gmailAction === "archive") {
            return {
              ...n,
              read: true,
              gmailStatus: "archived" as const,
              snoozedUntil: undefined,
              snoozeLabel: undefined,
            };
          }
          if (upd.gmailAction === "snooze") {
            return {
              ...n,
              read: true,
              gmailStatus: "snoozed" as const,
              snoozedUntil:
                upd.snoozeUntil ||
                new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              snoozeLabel: upd.snoozeLabel || "1시간 뒤",
            };
          }
          if (upd.gmailAction === "mark_read") {
            return {
              ...n,
              read: true,
            };
          }
          return n;
        });

      saveDb(db);

      if (imapBatchItems.length > 0) {
        void performBatchGmailImapActions(imapBatchItems).catch((err) => {
          console.error("Background performBatchGmailImapActions error:", err);
        });
      }

      return NextResponse.json({
        success: true,
        background: true,
        gmailResult: {
          success: true,
          message: `⚡ ${queue.length}건의 일괄 처리를 즉시 반영하고, Gmail 동기화는 백그라운드에서 실행 중입니다.`,
        },
        notifications: db.notifications,
        unreadCount: db.notifications.filter((n) => !n.read).length,
      });
    }

    if (action === "update_config") {
      const db = getDb();
      const prev = db.notificationState || {
        enabled: true,
        intervalMinutes: 5,
        initializedBaseline: true,
        processedDriveFileIds: [],
      };
      db.notificationState = {
        ...prev,
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : prev.enabled,
        intervalMinutes: body.intervalMinutes
          ? Number(body.intervalMinutes)
          : prev.intervalMinutes || 5,
      };
      saveDb(db);
      return NextResponse.json({
        success: true,
        notificationState: db.notificationState,
      });
    }

    return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Junior 알림 처리 중 오류 발생";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const clearAll = req.nextUrl.searchParams.get("all") === "true";

    const db = getDb();
    if (!db.notifications) db.notifications = [];

    let gmailResult: { success: boolean; message: string } | undefined;

    if (clearAll) {
      removeDetectedCandidatesForNotifications(db, db.notifications);
      db.notifications = [];
    } else if (id) {
      const target = db.notifications.find((n) => n.id === id);
      if (target) {
        removeDetectedCandidatesForNotifications(db, [target]);
      }
      if (target && target.type === "gmail_new_message" && target.fileId) {
        gmailResult = await performGmailImapAction({
          emailUid: target.fileId,
          subject: target.fileName,
          action: "trash",
        });
      }
      db.notifications = db.notifications.filter((n) => n.id !== id);
    }
    saveDb(db);

    return NextResponse.json({
      success: true,
      gmailResult,
      notifications: db.notifications,
      unreadCount: db.notifications.filter((n) => !n.read).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알림 삭제 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
