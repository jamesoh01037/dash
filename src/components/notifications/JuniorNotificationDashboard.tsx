"use client";

import React, { useState, useEffect } from "react";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Calendar,
  CheckSquare,
  Users,
  FileText,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Trash2,
  Clock,
  ShieldCheck,
  VolumeX,
  MessageCircle,
  FlaskConical,
  Loader2,
  ChevronDown,
  ChevronUp,
  Archive,
  ShieldAlert,
  AlarmClock,
  Mail,
  X,
} from "lucide-react";
import {
  JuniorNotificationItem,
  JuniorNotificationState,
  CalendarEventItem,
  TodoItem,
} from "@/lib/db";
import { withGoogleAuthUser } from "@/lib/utils";
import WorkShareDialog from "./WorkShareDialog";

interface JuniorNotificationDashboardProps {
  authEmail?: string;
  onRefreshTrigger?: () => void;
  onNavigateTab?: (
    tab:
      | "chat"
      | "todos"
      | "memory"
      | "notifications"
      | "gmail"
      | "contacts"
      | "gchat"
      | "gdrive"
  ) => void;
  onTriggerChatPrompt?: (prompt: string) => void;
}

export default function JuniorNotificationDashboard({
  authEmail,
  onRefreshTrigger,
  onNavigateTab,
  onTriggerChatPrompt,
}: JuniorNotificationDashboardProps) {
  const [notifications, setNotifications] = useState<JuniorNotificationItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [assistantName, setAssistantName] = useState<string>("Junior");
  const [taskConfirmDialog, setTaskConfirmDialog] = useState<{
    todoId: string;
    title: string;
    dueDate: string;
    description: string;
  } | null>(null);
  const [registeringTodoId, setRegisteringTodoId] = useState<string | null>(null);
  const [taskDialogError, setTaskDialogError] = useState<string | null>(null);
  const [calendarConfirmDialog, setCalendarConfirmDialog] = useState<{
    eventId: string;
    title: string;
    date: string;
    startClock: string;
    endClock: string;
    location: string;
    description: string;
  } | null>(null);
  const [registeringEventId, setRegisteringEventId] = useState<string | null>(null);
  const [calendarDialogError, setCalendarDialogError] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<JuniorNotificationState>({
    enabled: true,
    intervalMinutes: 5,
    initializedBaseline: true,
    processedDriveFileIds: [],
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkProgressMsg, setCheckProgressMsg] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulatingEmail, setSimulatingEmail] = useState(false);
  const [isBannerExpanded, setIsBannerExpanded] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchExecuting, setBatchExecuting] = useState(false);
  const [snoozeMenuOpenId, setSnoozeMenuOpenId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{
    mode: "webhook" | "local_manual";
    isPublicHttps: boolean;
    webhookUrl: string | null;
    hasPubSubTopic: boolean;
    driveWatchActive: boolean;
    gmailWatchActive: boolean;
    lastWebhookEventAt?: string;
  } | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [queuedEmailActions, setQueuedEmailActions] = useState<
    Array<{
      id: string;
      fileName: string;
      gmailAction: "spam" | "trash" | "archive" | "snooze" | "mark_read";
      snoozeUntil?: string;
      snoozeLabel?: string;
    }>
  >([]);

  const [shareDialog, setShareDialog] = useState<{
    mode: "mail" | "chat";
    notif: JuniorNotificationItem;
  } | null>(null);

  const openTaskConfirmDialog = (
    todo: JuniorNotificationItem["myTodosRegistered"][number],
    notif: JuniorNotificationItem
  ) => {
    setTaskDialogError(null);
    const dbTodo = todos.find((t) => t.id === todo.id);
    const rawDue = dbTodo?.dueDate || todo.dueDate || "";
    const hasConfirmedDue =
      rawDue &&
      !rawDue.includes("일정 확인 필요") &&
      !rawDue.includes("일정 미정");
    setTaskConfirmDialog({
      todoId: todo.id,
      title: dbTodo?.title || todo.title,
      dueDate: hasConfirmedDue ? rawDue : "",
      description:
        dbTodo?.description ||
        `[${assistantName} 알림 후보] '${notif.fileName}' (${notif.ownerName})에서 추출된 내 할 일`,
    });
  };

  const handleConfirmTaskRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskConfirmDialog || registeringTodoId) return;
    const { todoId, title, dueDate, description } = taskConfirmDialog;
    setRegisteringTodoId(todoId);
    setTaskDialogError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_google_task",
          id: todoId,
          title,
          dueDate,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTaskDialogError(data.error || "Google Tasks 등록에 실패했습니다.");
        return;
      }
      if (data.todo) {
        setTodos((prev) => {
          const exists = prev.some((t) => t.id === todoId);
          return exists
            ? prev.map((t) => (t.id === todoId ? data.todo : t))
            : [data.todo, ...prev];
        });
      }
      showToast(
        `✅ Google Tasks '${data.listName || assistantName}' 목록에 "${title}" 할 일이 등록되었습니다.`
      );
      setTaskConfirmDialog(null);
      onRefreshTrigger?.();
    } catch {
      setTaskDialogError("Google Tasks 등록 중 네트워크 오류가 발생했습니다.");
    } finally {
      setRegisteringTodoId(null);
    }
  };

  const openCalendarConfirmDialog = (
    ev: {
      id: string;
      title: string;
      startTime: string;
      location?: string;
      description?: string;
    },
    notif: JuniorNotificationItem
  ) => {
    setCalendarDialogError(null);
    const dbEv = calendarEvents.find((c) => c.id === ev.id);
    const sourceDocName = dbEv?.sourceDocName || notif.fileName || "";
    const cleanSourceTitle =
      sourceDocName.replace(/^\[(Mail|Drive|메일)\]\s*/i, "").trim() || ev.title;
    const rawStartTime = dbEv?.startTime || ev.startTime || "";
    const rawDescription = dbEv?.description || ev.description || "";
    const hasConfirmedTime =
      rawStartTime &&
      !rawStartTime.includes("일정 확인 필요") &&
      !rawStartTime.includes("일정 미정");
    const rawTimeSource = hasConfirmedTime
      ? `${rawStartTime} ${ev.title}`
      : `${ev.title} ${rawDescription}`;

    const dateMatch = rawTimeSource.match(
      /(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/
    );
    const parsedDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
      : "";

    const rangeMatch = rawTimeSource.match(
      /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/
    );
    const singleTimeMatch = !rangeMatch
      ? rawTimeSource.match(/(\d{1,2}):(\d{2})/)
      : null;

    let parsedStartClock = "";
    let parsedEndClock = "";
    if (rangeMatch) {
      parsedStartClock = `${rangeMatch[1].padStart(2, "0")}:${rangeMatch[2].padStart(2, "0")}`;
      parsedEndClock = `${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4].padStart(2, "0")}`;
    } else if (singleTimeMatch) {
      const sH = Number(singleTimeMatch[1]);
      const sM = singleTimeMatch[2].padStart(2, "0");
      parsedStartClock = `${String(sH).padStart(2, "0")}:${sM}`;
      parsedEndClock = `${String(Math.min(23, sH + 1)).padStart(2, "0")}:${sM}`;
    }

    setCalendarConfirmDialog({
      eventId: ev.id,
      title: cleanSourceTitle,
      date: parsedDate,
      startClock: parsedStartClock,
      endClock: parsedEndClock,
      location: dbEv?.location || ev.location || "",
      description:
        rawDescription || (sourceDocName ? `출처: ${sourceDocName}` : ""),
    });
  };

  const handleConfirmCalendarRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendarConfirmDialog || registeringEventId) return;
    const {
      eventId,
      title,
      date,
      startClock,
      endClock,
      location,
      description,
    } = calendarConfirmDialog;
    const combinedStartTime = [
      date,
      startClock && endClock
        ? `${startClock}~${endClock}`
        : startClock || endClock,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    setRegisteringEventId(eventId);
    setCalendarDialogError(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_google_calendar",
          id: eventId,
          title,
          startTime: combinedStartTime,
          location,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCalendarDialogError(
          data.error || "Google Calendar 등록에 실패했습니다."
        );
        return;
      }
      if (data.calendarEvent) {
        setCalendarEvents((prev) => {
          const exists = prev.some((c) => c.id === eventId);
          return exists
            ? prev.map((c) => (c.id === eventId ? data.calendarEvent : c))
            : [data.calendarEvent, ...prev];
        });
      }
      showToast(
        `✅ Google Calendar '${data.listName || assistantName}' 캘린더에 "${title}" 일정이 등록되었습니다.`
      );
      setCalendarConfirmDialog(null);
      onRefreshTrigger?.();
    } catch {
      setCalendarDialogError(
        "Google Calendar 등록 중 네트워크 오류가 발생했습니다."
      );
    } finally {
      setRegisteringEventId(null);
    }
  };

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => {
      setActionToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const getSnoozePresets = () => {
    const now = new Date();
    const in5Min = new Date(now.getTime() + 5 * 60 * 1000);
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);

    const todayEvening = new Date(now);
    todayEvening.setHours(18, 0, 0, 0);
    if (todayEvening.getTime() <= now.getTime()) {
      todayEvening.setTime(now.getTime() + 3 * 60 * 60 * 1000);
    }

    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(9, 0, 0, 0);

    const nextMonday = new Date(now);
    const day = nextMonday.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 0, 0, 0);

    return [
      { label: "5분 뒤", iso: in5Min.toISOString() },
      { label: "1시간 뒤", iso: in1Hour.toISOString() },
      { label: "오늘 오후 (또는 3시간 뒤)", iso: todayEvening.toISOString() },
      { label: "내일 오전 9:00", iso: tomorrowMorning.toISOString() },
      { label: "다음 주 월요일 오전 9:00", iso: nextMonday.toISOString() },
    ];
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setTodos(data.todos || []);
        setCalendarEvents(data.calendarEvents || []);
        if (data.assistantName) setAssistantName(data.assistantName);
        if (data.notificationState) setNotificationState(data.notificationState);
      }
    } catch {
      // ignore error
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookStatus = async () => {
    try {
      const res = await fetch("/api/google/watch");
      if (res.ok) {
        const data = await res.json();
        if (data.status) setWebhookStatus(data.status);
      }
    } catch {
      // ignore error
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchWebhookStatus();
  }, []);

  const handleToggleWebhook = async (action: "register" | "stop") => {
    setWebhookLoading(true);
    try {
      const res = await fetch("/api/google/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.status) setWebhookStatus(data.status);
      if (data.message) {
        showToast(data.message);
      } else if (action === "stop") {
        showToast("실시간 Webhook 수신을 중지했습니다.");
      }
    } catch {
      showToast("Webhook 설정 중 오류가 발생했습니다.");
    } finally {
      setWebhookLoading(false);
    }
  };

  /**
   * Manual or scheduled check.
   * Strictly follows user rule: if newCount === 0 ("알려줄 것이 없으면"), do NOT show any alert/banner/toast!
   */
  const handleCheckNow = async (mode: "normal" | "sim_drive" | "sim_email" = "normal") => {
    if (mode === "sim_drive") setSimulating(true);
    else if (mode === "sim_email") setSimulatingEmail(true);
    else {
      setChecking(true);
      setCheckProgressMsg("Google Drive와 Gmail을 동시에 확인하고 있습니다...");
    }

    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_now",
          stream: true,
          simulate: mode === "sim_drive",
          simulateEmail: mode === "sim_email",
        }),
      });
      if (!res.ok || !res.body) {
        if (mode === "normal") {
          showToast("즉시 체크 중 오류가 발생했습니다.");
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          if (!evt.trim()) continue;
          const lines = evt.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.replace("data: ", "").trim();
            }
          }
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === "progress" && data.message) {
              setCheckProgressMsg(data.message);
            } else if (eventType === "notification" && data.notification) {
              setNotifications((prev) => [
                data.notification,
                ...prev.filter((n) => n.id !== data.notification.id),
              ]);
            } else if (eventType === "done") {
              setNotifications(data.notifications || []);
              setTodos(data.todos || []);
              setCalendarEvents(data.calendarEvents || []);
              if (data.assistantName) setAssistantName(data.assistantName);
              if (data.notificationState) setNotificationState(data.notificationState);
              if (data.newCount > 0) {
                onRefreshTrigger?.();
                if (mode === "normal") {
                  showToast(`체크 완료: 새 알림 ${data.newCount}건이 도착했습니다.`);
                }
              } else if (mode === "normal") {
                showToast("체크 완료: 새로 도착한 메일·문서가 없습니다.");
              }
            } else if (eventType === "error" && mode === "normal") {
              showToast(data.error || "즉시 체크 중 오류가 발생했습니다.");
            }
          } catch {
            // ignore malformed event chunk
          }
        }
      }
    } catch {
      if (mode === "normal") {
        showToast("즉시 체크 중 네트워크 오류가 발생했습니다.");
      }
    } finally {
      setChecking(false);
      setCheckProgressMsg(null);
      setSimulating(false);
      setSimulatingEmail(false);
    }
  };

  const handleToggleAutoCheck = async () => {
    const nextEnabled = !notificationState.enabled;
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          enabled: nextEnabled,
          intervalMinutes: 5,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.notificationState) setNotificationState(data.notificationState);
      }
    } catch {
      // ignore
    }
  };

  const handleMarkRead = async (id?: string, all = false) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark_read",
          id,
          all,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        onRefreshTrigger?.();
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteNotification = async (id: string, isEmail = false) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        if (isEmail) {
          showToast(
            data.gmailResult?.message ||
              "🗑️ Gmail에서 메일을 삭제(휴지통 이동)하고 알림을 삭제했습니다."
          );
        }
        onRefreshTrigger?.();
      }
    } catch {
      // ignore
    } finally {
      setProcessingId(null);
    }
  };

  const handleExecuteGmailAction = async (
    notif: JuniorNotificationItem,
    gmailAction: "spam" | "trash" | "archive" | "snooze" | "mark_read",
    snoozeUntil?: string,
    snoozeLabel?: string
  ) => {
    setSnoozeMenuOpenId(null);
    setProcessingId(notif.id);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gmail_batch_action",
          queue: [
            {
              id: notif.id,
              fileName: notif.fileName,
              gmailAction,
              snoozeUntil,
              snoozeLabel,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        showToast(data.gmailResult?.message || "Gmail과 동기화되었습니다.");
        onRefreshTrigger?.();
      } else {
        showToast("Gmail 동기화 중 오류가 발생했습니다.");
      }
    } catch {
      showToast("Gmail 동기화 중 네트워크 오류가 발생했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleQueueGmailAction = (
    notif: JuniorNotificationItem,
    gmailAction: "spam" | "trash" | "archive" | "snooze" | "mark_read",
    snoozeUntil?: string,
    snoozeLabel?: string
  ) => {
    setSnoozeMenuOpenId(null);
    setQueuedEmailActions((prev) => {
      const existing = prev.find((item) => item.id === notif.id);
      // If clicking the exact same action (and not snooze with a new time), toggle it off from the queue
      if (
        existing &&
        existing.gmailAction === gmailAction &&
        (gmailAction !== "snooze" || existing.snoozeLabel === snoozeLabel)
      ) {
        return prev.filter((item) => item.id !== notif.id);
      }
      const nextItem = {
        id: notif.id,
        fileName: notif.fileName,
        gmailAction,
        snoozeUntil,
        snoozeLabel,
      };
      if (existing) {
        return prev.map((item) => (item.id === notif.id ? nextItem : item));
      }
      return [...prev, nextItem];
    });
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueuedEmailActions((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearQueue = () => {
    setQueuedEmailActions([]);
  };

  const handleExecuteBatchQueue = async () => {
    if (queuedEmailActions.length === 0 || batchExecuting) return;
    setBatchExecuting(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gmail_batch_action",
          queue: queuedEmailActions,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setQueuedEmailActions([]);
        showToast(
          data.gmailResult?.message ||
            `⚡ 큐에 담긴 이메일 작업 ${queuedEmailActions.length}건을 한 번에 모두 처리했습니다!`
        );
        onRefreshTrigger?.();
      }
    } catch {
      // ignore
    } finally {
      setBatchExecuting(false);
    }
  };

  const getQueuedActionMeta = (
    gmailAction: "spam" | "trash" | "archive" | "snooze" | "mark_read",
    snoozeLabel?: string
  ) => {
    switch (gmailAction) {
      case "spam":
        return {
          label: "🚫 스팸 처리",
          badgeClass: "bg-amber-500/20 text-amber-200 border-amber-500/40",
        };
      case "trash":
        return {
          label: "🗑️ 삭제(휴지통)",
          badgeClass: "bg-rose-500/20 text-rose-200 border-rose-500/40",
        };
      case "archive":
        return {
          label: "📥 보관처리",
          badgeClass: "bg-sky-500/20 text-sky-200 border-sky-500/40",
        };
      case "snooze":
        return {
          label: `⏰ 다시알림(${snoozeLabel || "예약"})`,
          badgeClass: "bg-purple-500/20 text-purple-200 border-purple-500/40",
        };
      case "mark_read":
        return {
          label: "✅ 읽음 표시",
          badgeClass: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
        };
    }
  };

  const queuedIds = new Set(queuedEmailActions.map((q) => q.id));
  const visibleNotifications = notifications.filter(
    (n) => !queuedIds.has(n.id) && n.gmailStatus !== "archived"
  );
  const unreadCount = visibleNotifications.filter((n) => !n.read).length;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950">
      {/* Gmail Action Feedback Toast */}
      {actionToast && (
        <div className="p-3 rounded-xl bg-slate-900/95 border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center justify-between shadow-lg">
          <span>{actionToast}</span>
          <button
            onClick={() => setActionToast(null)}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            닫기
          </button>
        </div>
      )}

      {/* Sticky Batch Email Queue Bar (이메일 일괄 처리 대기열) */}
      {queuedEmailActions.length > 0 && (
        <div className="sticky top-0 z-40 p-4 rounded-2xl bg-slate-900/95 backdrop-blur-md border-2 border-cyan-500/50 shadow-2xl shadow-cyan-500/10 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 font-extrabold text-xs">
                  큐 대기 {queuedEmailActions.length}건
                </span>
                <h4 className="text-sm font-bold text-slate-100">
                  📦 이메일 일괄 처리 대기열 (Queue)
                </h4>
                <span className="text-[11px] text-slate-400">
                  원하는 메일들의 작업을 모아 두었다가 Gmail과 한 번에 동기화하여 실행합니다
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClearQueue}
                disabled={batchExecuting}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all disabled:opacity-50"
              >
                전체 비우기
              </button>
              <button
                type="button"
                onClick={handleExecuteBatchQueue}
                disabled={batchExecuting}
                className="px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {batchExecuting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Gmail 일괄 처리 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>큐 한 번에 실행 ({queuedEmailActions.length}건 일괄 처리)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Queued Item Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800">
            {queuedEmailActions.map((qItem) => {
              const meta = getQueuedActionMeta(qItem.gmailAction, qItem.snoozeLabel);
              return (
                <div
                  key={qItem.id}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1.5 max-w-xs ${meta.badgeClass}`}
                >
                  <span className="font-bold shrink-0">{meta.label}:</span>
                  <span className="truncate text-slate-100">{qItem.fileName}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFromQueue(qItem.id)}
                    className="ml-1 text-slate-300 hover:text-white font-bold shrink-0"
                    title="이 작업 큐에서 취소"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Banner (Collapsible) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/25 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            onClick={() => setIsBannerExpanded(!isBannerExpanded)}
            className="flex flex-wrap items-center gap-2 cursor-pointer select-none"
          >
            <span className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <BellRing className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-100">
              알림
            </h3>
            {notificationState.lastCheckedAt && (
              <span className="text-[11px] text-slate-400">
                최근 확인:{" "}
                {new Date(notificationState.lastCheckedAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            {unreadCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                새 알림 {unreadCount}건
              </span>
            )}
            {checking && checkProgressMsg && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-medium flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {checkProgressMsg}
              </span>
            )}
          </div>

          {/* Compact Header Controls */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => handleCheckNow("normal")}
              disabled={checking}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {checking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              즉시 체크
            </button>

            {unreadCount > 0 && (
              <button
                onClick={() => handleMarkRead(undefined, true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                모두 읽음
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Details Section */}
        {isBannerExpanded && (
          <div className="pt-3 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700 flex items-center gap-1">
                    <VolumeX className="w-3 h-3 text-cyan-400" />
                    알려줄 항목이 없으면 무음 유지 (불필요한 알림 발송 안 함)
                  </span>
                  {notificationState.lastCheckedAt && (
                    <span className="text-[11px] text-slate-500">
                      최근 확인:{" "}
                      {new Date(notificationState.lastCheckedAt).toLocaleTimeString(
                        "ko-KR",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        }
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {webhookStatus?.isPublicHttps
                    ? "Google Drive & Gmail 실시간 Webhook 푸시를 통해 새 항목을 즉시 감지합니다."
                    : "로컬(localhost) 환경에서는 상단의 [즉시 체크] 버튼으로 동기화하며, HTTPS 서버 배포 시 Google 실시간 Webhook으로 자동 전환됩니다."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => handleCheckNow("sim_drive")}
                  disabled={simulating}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {simulating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3.5 h-3.5" />
                  )}
                  테스트: 외부인 Drive 문서 감지
                </button>

                <button
                  onClick={() => handleCheckNow("sim_email")}
                  disabled={simulatingEmail}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {simulatingEmail ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FlaskConical className="w-3.5 h-3.5" />
                  )}
                  테스트: 새 메일(+첨부문서) 감지
                </button>

                {webhookStatus?.isPublicHttps ? (
                  <button
                    onClick={() =>
                      handleToggleWebhook(
                        webhookStatus.driveWatchActive || webhookStatus.gmailWatchActive
                          ? "stop"
                          : "register"
                      )
                    }
                    disabled={webhookLoading}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-all disabled:opacity-50"
                  >
                    {webhookLoading
                      ? "처리 중..."
                      : webhookStatus.driveWatchActive || webhookStatus.gmailWatchActive
                        ? "실시간 Webhook 중지"
                        : "실시간 Webhook 등록"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggleWebhook("register")}
                    disabled={webhookLoading}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                  >
                    Webhook 상태 확인
                  </button>
                )}
              </div>
            </div>

            {/* Active Rules Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
              {/* Active Rule #1 Card */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    감시 규칙 #1 — Google Drive 타인 작성 신규 문서 감지 (Webhook 실시간 / 즉시 체크)
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold">● 작동 중</span>
                </div>
                <ul className="text-[11px] text-slate-400 space-y-1 pl-5 list-disc">
                  <li>
                    <strong>다른 사람이 만든 새로운 문서</strong>가 Google Drive에 등록되면 알림과 함께{" "}
                    <strong>핵심 본문 요약</strong>을 제공합니다.
                  </li>
                  <li>
                    <strong>내가 해야 할 일</strong>은 <strong>할 일의 &ldquo;Junior&rdquo; 목록</strong>에 자동 등록하고,{" "}
                    <strong>일정</strong>은 <strong>캘린더(일정)의 &ldquo;Junior&rdquo; 목록</strong>에 자동 등록합니다.
                  </li>
                  <li>
                    <strong>다른 사람이 해야 할 일</strong>은{" "}
                    <strong>
                      <code>제목 / 해당 일을 해야 할 사람 / 기한</code>
                    </strong>{" "}
                    형식으로 알려드립니다.
                  </li>
                </ul>
              </div>

              {/* Active Rule #2 Card */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    감시 규칙 #2 — Gmail 신규 수신 메일 & 첨부 문서 자동 분석 (Webhook 실시간 / 즉시 체크)
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold">● 작동 중</span>
                </div>
                <ul className="text-[11px] text-slate-400 space-y-1 pl-5 list-disc">
                  <li>
                    <strong>새로운 메일</strong>이 오면 본문을 요약하고,{" "}
                    <strong>첨부된 문서(.hwp/.hwpx/.docx/.pdf 등)가 있으면 그 문서도 함께 요약</strong>
                    해 알려드립니다.
                  </li>
                  <li>
                    <strong>내가 해야 할 일</strong>은 <strong>할 일의 &ldquo;Junior&rdquo; 목록</strong>에 자동 등록하고,{" "}
                    <strong>일정</strong>은 <strong>캘린더(일정)의 &ldquo;Junior&rdquo; 목록</strong>에 자동 등록합니다.
                  </li>
                  <li>
                    <strong>다른 사람이 해야 할 일</strong>은{" "}
                    <strong>
                      <code>제목 / 해당 일을 해야 할 사람 / 기한</code>
                    </strong>{" "}
                    형식으로 알려드립니다.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          <span>알림 내역을 불러오는 중입니다...</span>
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-12 text-center space-y-3">
          <Bell className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">
            {notifications.length > 0 && queuedEmailActions.length > 0
              ? `선택하신 ${queuedEmailActions.length}건이 일괄 처리 대기열(큐)로 이동되었습니다`
              : "현재 새로 알려드릴 알림이 없습니다 (무음 상태 유지 중)"}
          </p>
          <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
            {notifications.length > 0 && queuedEmailActions.length > 0
              ? "상단 대기열 바에서 [큐 한 번에 실행]을 눌러 Gmail에 일괄 반영하거나, 항목 옆 × 버튼으로 취소하여 다시 목록에 표시할 수 있습니다."
              : "상단의 [즉시 체크] 버튼을 누르거나 실시간 Webhook이 수신되면 Google Drive와 Gmail을 점검해 새 항목이 있을 때만 알림을 띄웁니다."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleNotifications.map((notif) => {
            const isEmailNotif = notif.type === "gmail_new_message";
            const isHwp =
              !isEmailNotif &&
              (/\.(hwp|hwpx)$/i.test(notif.fileName) ||
                (notif.fileMimeType || "").toLowerCase().includes("hwp"));
            const queuedItem = isEmailNotif
              ? queuedEmailActions.find((q) => q.id === notif.id)
              : undefined;
            const queuedMeta = queuedItem
              ? getQueuedActionMeta(queuedItem.gmailAction, queuedItem.snoozeLabel)
              : null;

            return (
              <div
                key={notif.id}
                className={`rounded-2xl border p-5 space-y-4 transition-all ${
                  queuedItem
                    ? "bg-slate-900/90 border-cyan-500/50 ring-1 ring-cyan-500/30"
                    : notif.read
                    ? "bg-slate-900/50 border-slate-800/80"
                    : "bg-slate-900/95 border-amber-500/40 shadow-lg shadow-amber-500/5"
                }`}
              >
                {/* Notification Header */}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!notif.read && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-extrabold text-[10px]">
                          NEW
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          isEmailNotif
                            ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                            : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                        }`}
                      >
                        {isEmailNotif ? "✉️ 새 Gmail 수신" : "☁️ Google Drive 신규 공유 문서"}
                      </span>
                      {queuedMeta && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${queuedMeta.badgeClass}`}
                        >
                          ⏳ 큐 대기 중: {queuedMeta.label}
                          <button
                            type="button"
                            onClick={() => handleRemoveFromQueue(notif.id)}
                            className="ml-1 hover:underline font-extrabold"
                            title="큐 대기 취소"
                          >
                            [취소]
                          </button>
                        </span>
                      )}
                      {isEmailNotif && notif.gmailStatus === "archived" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          📥 Gmail 보관처리됨
                        </span>
                      )}
                      {isEmailNotif && notif.gmailStatus === "snoozed" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          ⏰ 다시알림 예약됨 ({notif.snoozeLabel || "예약"})
                        </span>
                      )}
                      <h4 className="text-sm font-bold text-slate-100">
                        {notif.title
                          .replace(/^✉️?\s*새로운 메일이 도착했습니다:\s*/, "")
                          .replace(/^'([^']+)'(\s*\(첨부문서.*\))?$/, "$1$2")}
                      </h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <span>
                        👤 {isEmailNotif ? "발신자:" : "작성/등록자:"}{" "}
                        <strong className="text-slate-200">{notif.ownerName}</strong>
                        {notif.ownerEmail ? ` (${notif.ownerEmail})` : ""}
                      </span>
                      <span>
                        🕒 감지 시각:{" "}
                        {new Date(notif.createdAt).toLocaleString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end lg:shrink-0 relative">
                    {processingId === notif.id && (
                      <span className="text-[11px] text-amber-300 flex items-center gap-1 mr-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        동기화 중...
                      </span>
                    )}

                    {isEmailNotif && (
                      <a
                        href={(() => {
                          const base = authEmail
                            ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(authEmail)}`
                            : "https://mail.google.com/mail/u/0/";
                          const queryParts: string[] = [];
                          if (notif.ownerEmail) {
                            queryParts.push(`from:${notif.ownerEmail}`);
                          } else if (notif.ownerName && notif.ownerName !== "알 수 없음") {
                            queryParts.push(`from:${notif.ownerName}`);
                          }
                          if (notif.fileName) {
                            queryParts.push(notif.fileName);
                          }
                          const searchQuery = queryParts.join(" ").trim();
                          return searchQuery
                            ? `${base}#search/${encodeURIComponent(searchQuery)}`
                            : `${base}#inbox`;
                        })()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1"
                      >
                        Gmail에서 확인 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {/* 3. 보관처리 버튼 (큐에 담기) */}
                    {isEmailNotif && (
                      <button
                        onClick={() => handleQueueGmailAction(notif, "archive")}
                        disabled={batchExecuting || processingId === notif.id}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1 transition-all disabled:opacity-50 ${
                          notif.gmailStatus === "archived"
                            ? "bg-sky-500/20 text-sky-200 border-sky-500/40"
                            : "bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700"
                        }`}
                        title="보관처리 대기열(큐)에 추가"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>
                          {notif.gmailStatus === "archived" ? "보관됨" : "보관처리"}
                        </span>
                      </button>
                    )}

                    {/* 4. 다시알림 버튼 & 시간 선택 팝오버 (큐에 담기) */}
                    {isEmailNotif && (
                      <div className="relative">
                        <button
                          onClick={() =>
                            setSnoozeMenuOpenId(
                              snoozeMenuOpenId === notif.id ? null : notif.id
                            )
                          }
                          disabled={batchExecuting}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border flex items-center gap-1 transition-all disabled:opacity-50 ${
                            queuedItem?.gmailAction === "snooze"
                              ? "bg-purple-500 text-slate-950 border-purple-400 font-extrabold shadow-md"
                              : notif.gmailStatus === "snoozed"
                              ? "bg-purple-500/20 text-purple-200 border-purple-500/40"
                              : "bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700"
                          }`}
                          title="다시알림 큐에 추가"
                        >
                          <AlarmClock className="w-3.5 h-3.5" />
                          <span>
                            {queuedItem?.gmailAction === "snooze"
                              ? `다시알림 대기 (${queuedItem.snoozeLabel || "예약"})`
                              : notif.gmailStatus === "snoozed"
                              ? `다시알림 (${notif.snoozeLabel || "예약"})`
                              : "다시알림"}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {snoozeMenuOpenId === notif.id && (
                          <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-30 space-y-1">
                            <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-800">
                              ⏰ 다시알림 큐에 담을 시간 선택
                            </p>
                            {getSnoozePresets().map((preset, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() =>
                                  handleQueueGmailAction(
                                    notif,
                                    "snooze",
                                    preset.iso,
                                    preset.label
                                  )
                                }
                                className="w-full px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-purple-500/20 hover:text-purple-200 rounded-lg transition-colors flex items-center justify-between"
                              >
                                <span>{preset.label}</span>
                                <Clock className="w-3 h-3 text-purple-400" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isHwp && (
                      <a
                        href={`/api/google-drive/hwp/${encodeURIComponent(
                          notif.fileId
                        )}/${encodeURIComponent(notif.fileName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1"
                      >
                        🧩 크롬 rhwp로 본문/편집
                      </a>
                    )}
                    {notif.fileWebViewLink && (
                      <a
                        href={withGoogleAuthUser(notif.fileWebViewLink, authEmail)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-[11px] font-medium flex items-center gap-1"
                      >
                        Drive에서 열기 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {!notif.read && (
                      <button
                        onClick={() =>
                          isEmailNotif
                            ? handleQueueGmailAction(notif, "mark_read")
                            : handleMarkRead(notif.id)
                        }
                        disabled={batchExecuting || processingId === notif.id}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium border bg-slate-800 hover:bg-slate-700 text-emerald-300 border-transparent transition-all disabled:opacity-50"
                      >
                        읽음 표시
                      </button>
                    )}

                    {/* 1. 스팸 아이콘 버튼 (큐에 담기) */}
                    {isEmailNotif && (
                      <button
                        onClick={() => handleQueueGmailAction(notif, "spam")}
                        disabled={batchExecuting || processingId === notif.id}
                        className="p-1.5 rounded-lg border text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 border-transparent hover:border-amber-500/30 transition-all disabled:opacity-50"
                        title="스팸처리 대기열(큐)에 추가"
                      >
                        <ShieldAlert className="w-4 h-4" />
                      </button>
                    )}

                    {/* 2. 휴지통 아이콘 버튼 (이메일이면 큐에 담기, 드라이브 알림이면 삭제) */}
                    <button
                      onClick={() =>
                        isEmailNotif
                          ? handleQueueGmailAction(notif, "trash")
                          : handleDeleteNotification(notif.id, false)
                      }
                      disabled={batchExecuting || processingId === notif.id}
                      className="p-1.5 rounded-lg border text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border-transparent hover:border-rose-500/30 transition-all disabled:opacity-50"
                      title={
                        isEmailNotif
                          ? "삭제 대기열(큐)에 추가"
                          : "알림 삭제"
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 1. Document or Email Summary */}
                <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    1. {isEmailNotif ? "새로 도착한 메일 본문 요약" : "새로 등록된 문서 요약"} ({notif.fileName})
                  </div>
                  <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                    {notif.summary}
                  </p>
                </div>

                {/* 1-B. Attached Document Summaries (when present) */}
                {notif.attachmentSummaries && notif.attachmentSummaries.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-2.5">
                    <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      📎 첨부된 문서 요약 ({notif.attachmentSummaries.length}건)
                    </div>
                    <div className="space-y-2">
                      {notif.attachmentSummaries.map((att, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-950/90 border border-sky-500/20 space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-sky-200">
                              📄 {att.fileName}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              {att.mimeType}
                              {att.size ? ` · ${(att.size / 1024).toFixed(1)}KB` : ""}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed">
                            {att.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grid for 2. My Todos & 3. Calendar Schedules */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                  {/* 2. My Todos Auto-Registered */}
                  <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5" />
                        2. 감지된 내가 해야 할 일 후보 ({notif.myTodosRegistered.length}건)
                      </span>
                    </div>

                    {notif.myTodosRegistered.length === 0 ? (
                      <p className="text-[11px] text-slate-400">
                        이 문서에서 직접 수행해야 할 할 일은 감지되지 않았습니다.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {notif.myTodosRegistered.map((todo) => {
                          const dbTodo = todos.find((t) => t.id === todo.id);
                          const isRegistered = Boolean(
                            dbTodo?.googleTaskId || dbTodo?.googleTaskSyncedAt
                          );
                          return (
                            <li
                              key={todo.id}
                              className="p-2.5 rounded-lg bg-slate-950/80 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="text-slate-100 font-medium break-words">
                                  ✅ {todo.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {todo.dueDate &&
                                  !todo.dueDate.includes("일정 확인 필요") &&
                                  !todo.dueDate.includes("일정 미정") && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                                      기한: {todo.dueDate}
                                    </span>
                                  )}
                                {isRegistered ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    등록 완료
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openTaskConfirmDialog(todo, notif)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                                    title={`Google Tasks '${assistantName}' 목록에 등록`}
                                  >
                                    <CheckSquare className="w-3 h-3" />
                                    해야 할 일로 등록
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* 3. Schedules Auto-Registered to Calendar */}
                  <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        3. 감지된 등록해야 할 일정 후보 ({notif.calendarEventsRegistered.length}건)
                      </span>
                    </div>

                    {notif.calendarEventsRegistered.length === 0 ? (
                      <p className="text-[11px] text-slate-400">
                        이 문서에서 캘린더에 등록할 일정이 감지되지 않았습니다.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {notif.calendarEventsRegistered.map((ev) => {
                          const dbEv = calendarEvents.find((c) => c.id === ev.id);
                          const isRegistered = Boolean(dbEv?.googleCalendarSyncedAt);
                          return (
                            <li
                              key={ev.id}
                              className="p-2 rounded-lg bg-slate-950/80 border border-cyan-500/20 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold shrink-0">
                                    {ev.listName || assistantName} 목록
                                  </span>
                                  <p className="text-slate-100 font-medium truncate">
                                    📅 {ev.title}
                                  </p>
                                </div>
                                <p className="text-[10px] text-cyan-300">
                                  일시: {ev.startTime}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isRegistered ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold">
                                    등록 완료
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openCalendarConfirmDialog(ev, notif)}
                                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                                    title={`Google Calendar '${assistantName}' 캘린더에 등록`}
                                  >
                                    <Calendar className="w-3 h-3" />
                                    캘린더 등록
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* 4. Other People's Tasks ("제목 / 해당 일을 해야 할 사람 / 기한") */}
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      4. 감지된 다른 사람이 해야 할 일 (형식: 제목 / 해당 일을 해야 할 사람 / 기한)
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShareDialog({ mode: "mail", notif })}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Mail className="w-3 h-3" />
                        Mail로 업무공유
                      </button>
                      <button
                        type="button"
                        onClick={() => setShareDialog({ mode: "chat", notif })}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                      >
                        <MessageCircle className="w-3 h-3" />
                        Chat으로 업무공유
                      </button>
                    </div>
                  </div>

                  {notif.otherPeopleTasks.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      이 문서에서 다른 사람이 수행해야 할 별도 업무가 감지되지 않았습니다.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {notif.otherPeopleTasks.map((task, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-slate-950/90 border border-amber-500/20 font-mono text-xs text-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <span className="font-semibold text-amber-100">
                            {task.title} / {task.assignee} / {task.deadline}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] shrink-0 font-sans">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                              담당: {task.assignee}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                              기한: {task.deadline}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shareDialog && (
        <WorkShareDialog
          mode={shareDialog.mode}
          notification={shareDialog.notif}
          onClose={() => setShareDialog(null)}
          onSharedSuccess={(msg) => showToast(msg)}
        />
      )}

      {taskConfirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl border bg-emerald-500/15 border-emerald-500/30 text-emerald-300">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Google Tasks 등록 확인
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    대상 목록: {assistantName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTaskConfirmDialog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              id="notif-confirm-task-form"
              onSubmit={handleConfirmTaskRegister}
              className="p-5 space-y-3.5"
            >
              {taskDialogError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 break-words">
                  {taskDialogError}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  할 일 제목
                </label>
                <input
                  type="text"
                  value={taskConfirmDialog.title}
                  onChange={(e) =>
                    setTaskConfirmDialog({
                      ...taskConfirmDialog,
                      title: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  기한
                </label>
                <input
                  type="date"
                  value={
                    /^\d{4}-\d{2}-\d{2}$/.test(taskConfirmDialog.dueDate)
                      ? taskConfirmDialog.dueDate
                      : ""
                  }
                  onChange={(e) =>
                    setTaskConfirmDialog({
                      ...taskConfirmDialog,
                      dueDate: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  설명 / 메모
                </label>
                <textarea
                  rows={3}
                  value={taskConfirmDialog.description}
                  onChange={(e) =>
                    setTaskConfirmDialog({
                      ...taskConfirmDialog,
                      description: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-emerald-500"
                />
              </div>
            </form>

            <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-900/90">
              <button
                type="button"
                onClick={() => setTaskConfirmDialog(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                취소
              </button>
              <button
                type="submit"
                form="notif-confirm-task-form"
                disabled={Boolean(registeringTodoId)}
                className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {registeringTodoId && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Google Tasks에 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {calendarConfirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl border bg-cyan-500/15 border-cyan-500/30 text-cyan-300">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Google Calendar 등록 확인
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    대상 캘린더: {assistantName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalendarConfirmDialog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              id="notif-confirm-calendar-form"
              onSubmit={handleConfirmCalendarRegister}
              className="p-5 space-y-3.5"
            >
              {calendarDialogError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 break-words">
                  {calendarDialogError}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  일정 제목
                </label>
                <input
                  type="text"
                  value={calendarConfirmDialog.title}
                  onChange={(e) =>
                    setCalendarConfirmDialog({
                      ...calendarConfirmDialog,
                      title: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    날짜
                  </label>
                  <input
                    type="date"
                    value={calendarConfirmDialog.date}
                    onChange={(e) =>
                      setCalendarConfirmDialog({
                        ...calendarConfirmDialog,
                        date: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    시작 시간
                  </label>
                  <input
                    type="time"
                    value={calendarConfirmDialog.startClock}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      let nextEnd = calendarConfirmDialog.endClock;
                      if (nextStart && (!nextEnd || nextEnd <= nextStart)) {
                        const [h, m] = nextStart.split(":").map(Number);
                        const total = Math.min(23 * 60 + 59, h * 60 + m + 60);
                        nextEnd = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                      }
                      setCalendarConfirmDialog({
                        ...calendarConfirmDialog,
                        startClock: nextStart,
                        endClock: nextEnd,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    종료 시간
                  </label>
                  <input
                    type="time"
                    value={calendarConfirmDialog.endClock}
                    onChange={(e) =>
                      setCalendarConfirmDialog({
                        ...calendarConfirmDialog,
                        endClock: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  감지된 장소
                </label>
                <input
                  type="text"
                  value={calendarConfirmDialog.location}
                  onChange={(e) =>
                    setCalendarConfirmDialog({
                      ...calendarConfirmDialog,
                      location: e.target.value,
                    })
                  }
                  placeholder="장소 (선택)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  설명 / 메모
                </label>
                <textarea
                  rows={3}
                  value={calendarConfirmDialog.description}
                  onChange={(e) =>
                    setCalendarConfirmDialog({
                      ...calendarConfirmDialog,
                      description: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-cyan-500"
                />
              </div>
            </form>

            <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-900/90">
              <button
                type="button"
                onClick={() => setCalendarConfirmDialog(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                취소
              </button>
              <button
                type="submit"
                form="notif-confirm-calendar-form"
                disabled={Boolean(registeringEventId)}
                className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50"
              >
                {registeringEventId && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Google Calendar에 등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
