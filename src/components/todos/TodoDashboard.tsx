"use client";

import React, { useState, useEffect } from "react";
import { TodoItem, CalendarEventItem } from "@/lib/db";
import { withGoogleAuthUser } from "@/lib/utils";
import {
  CheckSquare,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  Circle,
  Sparkles,
  ExternalLink,
  FolderKanban,
  Loader2,
  X,
} from "lucide-react";

interface TodoDashboardProps {
  userName?: string;
  assistantName?: string;
  authEmail?: string;
  onRefreshTrigger?: () => void;
}

export default function TodoDashboard({
  userName = "사용자",
  assistantName = "Junior",
  authEmail,
  onRefreshTrigger,
}: TodoDashboardProps) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [selectedList, setSelectedList] = useState<string>("ALL");
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [newTitle, setNewTitle] = useState("");
  const [newItemType, setNewItemType] = useState<"todo" | "schedule">("todo");
  const [newListName, setNewListName] = useState<string>(assistantName);
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedTodoIds, setSelectedTodoIds] = useState<string[]>([]);
  const [isBulkDeletingEvents, setIsBulkDeletingEvents] = useState(false);
  const [isBulkDeletingTodos, setIsBulkDeletingTodos] = useState(false);
  const [registeringTodoIds, setRegisteringTodoIds] = useState<string[]>([]);
  const [registeringEventIds, setRegisteringEventIds] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<
    | {
        type: "calendar";
        ev: CalendarEventItem;
        title: string;
        date: string;
        startClock: string;
        endClock: string;
        location: string;
        description: string;
      }
    | {
        type: "task";
        todo: TodoItem;
        title: string;
        dueDate: string;
        description: string;
      }
    | null
  >(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const fetchTodos = async () => {
    try {
      const res = await fetch("/api/todos");
      if (res.ok) {
        const data = await res.json();
        setTodos(data.todos || []);
        setCalendarEvents(data.calendarEvents || []);
      }
    } catch (err) {
      console.error("Failed to fetch todos:", err);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, []);

  const handleToggleComplete = async (todo: TodoItem) => {
    const updatedStatus = !todo.completed;
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, completed: updatedStatus } : t))
    );

    try {
      await fetch("/api/todos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, completed: updatedStatus }),
      });
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to update todo:", err);
      fetchTodos();
    }
  };

  const handleDelete = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to delete todo:", err);
      fetchTodos();
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
    setSelectedEventIds((prev) => prev.filter((item) => item !== id));
    try {
      await fetch(`/api/todos?id=${id}&type=schedule`, { method: "DELETE" });
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to delete schedule:", err);
      fetchTodos();
    }
  };

  const openTaskConfirmDialog = (todo: TodoItem) => {
    setDialogError(null);
    const hasConfirmedDue =
      todo.dueDate &&
      !todo.dueDate.includes("일정 확인 필요") &&
      !todo.dueDate.includes("일정 미정");
    setConfirmDialog({
      type: "task",
      todo,
      title: todo.title,
      dueDate: hasConfirmedDue ? todo.dueDate || "" : "",
      description: todo.description || "",
    });
  };

  const openCalendarConfirmDialog = (ev: CalendarEventItem) => {
    setDialogError(null);
    const cleanSourceTitle =
      (ev.sourceDocName || "")
        .replace(/^\[(Mail|Drive|메일)\]\s*/i, "")
        .trim() || ev.title;
    const hasConfirmedTime =
      ev.startTime &&
      !ev.startTime.includes("일정 확인 필요") &&
      !ev.startTime.includes("일정 미정");
    const rawTimeSource = hasConfirmedTime
      ? `${ev.startTime} ${ev.title}`
      : `${ev.title} ${ev.description || ""}`;

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

    setConfirmDialog({
      type: "calendar",
      ev,
      title: cleanSourceTitle,
      date: parsedDate,
      startClock: parsedStartClock,
      endClock: parsedEndClock,
      location: ev.location || "",
      description:
        ev.description ||
        (ev.sourceDocName ? `출처: ${ev.sourceDocName}` : ""),
    });
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmDialog) return;

    if (confirmDialog.type === "task") {
      const { todo, title, dueDate, description } = confirmDialog;
      if (registeringTodoIds.includes(todo.id)) return;
      setRegisteringTodoIds((prev) => [...prev, todo.id]);
      setDialogError(null);
      setActionNotice(null);
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "register_google_task",
            id: todo.id,
            title,
            dueDate,
            description,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setDialogError(data.error || "Google Tasks 등록에 실패했습니다.");
          return;
        }
        if (data.todo) {
          setTodos((prev) => prev.map((t) => (t.id === todo.id ? data.todo : t)));
        }
        setActionNotice({
          type: "success",
          text: `Google Tasks '${data.listName || assistantName}' 목록에 "${title}" 할 일이 등록되었습니다.`,
        });
        setConfirmDialog(null);
        onRefreshTrigger?.();
      } catch (err) {
        console.error("Failed to register Google Task:", err);
        setDialogError("Google Tasks 등록 중 네트워크 오류가 발생했습니다.");
      } finally {
        setRegisteringTodoIds((prev) => prev.filter((item) => item !== todo.id));
      }
      return;
    }

    const { ev, title, date, startClock, endClock, location, description } = confirmDialog;
    const combinedStartTime = [
      date,
      startClock && endClock
        ? `${startClock}~${endClock}`
        : startClock || endClock,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (registeringEventIds.includes(ev.id)) return;
    setRegisteringEventIds((prev) => [...prev, ev.id]);
    setDialogError(null);
    setActionNotice(null);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_google_calendar",
          id: ev.id,
          title,
          startTime: combinedStartTime || ev.startTime,
          location,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDialogError(data.error || "Google Calendar 등록에 실패했습니다.");
        return;
      }
      if (data.calendarEvent) {
        setCalendarEvents((prev) =>
          prev.map((item) => (item.id === ev.id ? data.calendarEvent : item))
        );
      }
      setActionNotice({
        type: "success",
        text: `Google Calendar '${data.listName || assistantName}' 캘린더에 "${title}" 일정이 등록되었습니다.`,
      });
      setConfirmDialog(null);
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to register Google Calendar event:", err);
      setDialogError("Google Calendar 등록 중 네트워크 오류가 발생했습니다.");
    } finally {
      setRegisteringEventIds((prev) => prev.filter((item) => item !== ev.id));
    }
  };

  const handleToggleSelectEvent = (id: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllEvents = () => {
    const visibleIds = listFilteredEvents.map((e) => e.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedEventIds.includes(id));
    if (allSelected) {
      setSelectedEventIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedEventIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDeleteEvents = async (targetIds: string[]) => {
    if (targetIds.length === 0 || isBulkDeletingEvents) return;
    setIsBulkDeletingEvents(true);
    const idSet = new Set(targetIds);
    setCalendarEvents((prev) => prev.filter((e) => !idSet.has(e.id)));
    setSelectedEventIds((prev) => prev.filter((id) => !idSet.has(id)));
    try {
      await fetch("/api/todos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, type: "schedule" }),
      });
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to bulk delete schedules:", err);
      fetchTodos();
    } finally {
      setIsBulkDeletingEvents(false);
    }
  };

  const handleToggleSelectTodo = (id: string) => {
    setSelectedTodoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllTodos = () => {
    const visibleIds = filteredTodos.map((t) => t.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedTodoIds.includes(id));
    if (allSelected) {
      setSelectedTodoIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedTodoIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleBulkDeleteTodos = async (targetIds: string[]) => {
    if (targetIds.length === 0 || isBulkDeletingTodos) return;
    setIsBulkDeletingTodos(true);
    const idSet = new Set(targetIds);
    setTodos((prev) => prev.filter((t) => !idSet.has(t.id)));
    setSelectedTodoIds((prev) => prev.filter((id) => !idSet.has(id)));
    try {
      await fetch("/api/todos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, type: "todo" }),
      });
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to bulk delete todos:", err);
      fetchTodos();
    } finally {
      setIsBulkDeletingTodos(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          priority: newPriority,
          dueDate: newDueDate || undefined,
          listName: newListName || "Junior",
          itemType: newItemType,
        }),
      });

      if (res.ok) {
        setNewTitle("");
        setNewDueDate("");
        setNewPriority("medium");
        await fetchTodos();
        onRefreshTrigger?.();
      }
    } catch (err) {
      console.error("Failed to add todo:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const listFilteredTodos = todos.filter((t) => {
    if (t.googleTaskId || t.googleTaskSyncedAt) return false;
    const itemList = t.listName || "Junior";
    if (selectedList === "ALL") return true;
    return itemList.toLowerCase() === selectedList.toLowerCase();
  });

  const listFilteredEvents = calendarEvents.filter((e) => {
    if (e.googleCalendarSyncedAt) return false;
    const itemList = e.listName || "Junior";
    if (selectedList === "ALL") return true;
    return itemList.toLowerCase() === selectedList.toLowerCase();
  });

  const filteredTodos = listFilteredTodos.filter((t) => {
    if (filter === "pending") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const juniorTodoCount = todos.filter(
    (t) => (t.listName || "Junior").toLowerCase() === "junior"
  ).length;
  const juniorEventCount = calendarEvents.filter(
    (e) => (e.listName || "Junior").toLowerCase() === "junior"
  ).length;

  const pendingCount = listFilteredTodos.filter((t) => !t.completed).length;
  const completedCount = listFilteredTodos.filter((t) => t.completed).length;

  const priorityBadge = (priority: "low" | "medium" | "high") => {
    switch (priority) {
      case "high":
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
            높음
          </span>
        );
      case "medium":
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            보통
          </span>
        );
      case "low":
        return (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
            낮음
          </span>
        );
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* List Selector Header ("Junior" 목록 기본 선택) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-junior-950/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-junior-500/15 border border-junior-500/30 text-junior-400">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">
              {userName}님의 할 일 & 일정 후보 목록 관리
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setSelectedList(selectedList === "ALL" ? assistantName : "ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              selectedList === "ALL"
                ? "bg-slate-800 text-white border-slate-700"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            전체 목록 ({todos.length})
          </button>
        </div>
      </div>

      {actionNotice && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
            actionNotice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{actionNotice.text}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-[11px] opacity-75 hover:opacity-100 shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      {/* Section 1: Calendar Schedules in "Junior" List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200">
              일정 후보 — {selectedList === "ALL" ? "전체 목록" : `${userName}님의 후보 목록`} ({listFilteredEvents.length}건)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {listFilteredEvents.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleToggleSelectAllEvents}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  {listFilteredEvents.every((e) => selectedEventIds.includes(e.id))
                    ? "선택 해제"
                    : "전체 선택"}
                </button>
                {selectedEventIds.filter((id) => listFilteredEvents.some((e) => e.id === id))
                  .length > 0 && (
                  <button
                    type="button"
                    disabled={isBulkDeletingEvents}
                    onClick={() =>
                      handleBulkDeleteEvents(
                        selectedEventIds.filter((id) => listFilteredEvents.some((e) => e.id === id))
                      )
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    선택 삭제 (
                    {selectedEventIds.filter((id) => listFilteredEvents.some((e) => e.id === id)).length}
                    건)
                  </button>
                )}
                <button
                  type="button"
                  disabled={isBulkDeletingEvents}
                  onClick={() => handleBulkDeleteEvents(listFilteredEvents.map((e) => e.id))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  일정 일괄 삭제
                </button>
              </>
            )}
          </div>
        </div>

        {listFilteredEvents.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-900/30 border border-slate-800/60 text-center text-slate-500 text-xs">
            등록된 후보 일정이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {listFilteredEvents.map((ev) => {
              const isEventSelected = selectedEventIds.includes(ev.id);
              const hasConfirmedTime =
                ev.startTime &&
                !ev.startTime.includes("일정 확인 필요") &&
                !ev.startTime.includes("일정 미정");
              const sourceLabel = ev.sourceDocName
                ? /^\[(Mail|Drive|메일)\]/i.test(ev.sourceDocName)
                  ? ev.sourceDocName.replace(/^\[메일\]/i, "[Mail]")
                  : `${ev.sourceDocId?.startsWith("gmail-") ? "[Mail]" : "[Drive]"} ${ev.sourceDocName}`
                : undefined;

              return (
                <div
                  key={ev.id}
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3.5 shadow-sm transition-all ${
                    isEventSelected
                      ? "bg-slate-900/90 border-rose-500/50 ring-1 ring-rose-500/20"
                      : "bg-slate-900/60 border-cyan-500/25 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Card Header: Checkbox + Time/Location + Delete */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isEventSelected}
                          onChange={() => handleToggleSelectEvent(ev.id)}
                          className="h-4 w-4 rounded border-slate-700 accent-[#1A73E8] cursor-pointer shrink-0"
                          aria-label={`${ev.title} 선택`}
                        />
                        {hasConfirmedTime && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-cyan-300 border border-slate-700/70 font-medium">
                            일시: {ev.startTime}
                          </span>
                        )}
                        {ev.location && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/60 text-slate-300 border border-slate-700/60">
                            장소: {ev.location}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(ev.id)}
                        className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors"
                        title="일정 삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                        삭제
                      </button>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-100 break-words leading-snug">
                        📅 {ev.title}
                      </p>
                      {sourceLabel && (
                        <p className="text-[11px] font-medium text-slate-100 break-words">
                          출처: {sourceLabel}
                        </p>
                      )}
                      {ev.description &&
                        !(sourceLabel && ev.description.trim().startsWith("출처:")) && (
                          <p className="text-xs text-slate-400 break-words leading-relaxed">
                            {ev.description}
                          </p>
                        )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={registeringEventIds.includes(ev.id)}
                      onClick={() => openCalendarConfirmDialog(ev)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title={`Google Calendar '${assistantName}' 캘린더에 등록`}
                    >
                      {registeringEventIds.includes(ev.id) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Calendar className="w-3.5 h-3.5" />
                      )}
                      캘린더 등록
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: To-Do List in "Junior" List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-200">
              할 일 후보 — {selectedList === "ALL" ? "전체 목록" : `${userName}님의 후보 목록`} ({filteredTodos.length}건)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {filteredTodos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleToggleSelectAllTodos}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  {filteredTodos.every((t) => selectedTodoIds.includes(t.id))
                    ? "선택 해제"
                    : "전체 선택"}
                </button>
                {selectedTodoIds.filter((id) => filteredTodos.some((t) => t.id === id)).length >
                  0 && (
                  <button
                    type="button"
                    disabled={isBulkDeletingTodos}
                    onClick={() =>
                      handleBulkDeleteTodos(
                        selectedTodoIds.filter((id) => filteredTodos.some((t) => t.id === id))
                      )
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    선택 삭제 (
                    {selectedTodoIds.filter((id) => filteredTodos.some((t) => t.id === id)).length}
                    건)
                  </button>
                )}
                {completedCount > 0 && (
                  <button
                    type="button"
                    disabled={isBulkDeletingTodos}
                    onClick={() =>
                      handleBulkDeleteTodos(
                        listFilteredTodos.filter((t) => t.completed).map((t) => t.id)
                      )
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    완료 항목 삭제 ({completedCount})
                  </button>
                )}
                <button
                  type="button"
                  disabled={isBulkDeletingTodos}
                  onClick={() => handleBulkDeleteTodos(filteredTodos.map((t) => t.id))}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  할일 일괄 삭제
                </button>
              </>
            )}
          </div>
        </div>

        {/* Todo List */}
        {filteredTodos.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-900/30 border border-slate-800/60 text-center text-slate-500 text-xs">
            등록된 후보 할 일이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredTodos.map((todo) => {
              const isTodoSelected = selectedTodoIds.includes(todo.id);
              const hasConfirmedDue =
                todo.dueDate &&
                !todo.dueDate.includes("일정 확인 필요") &&
                !todo.dueDate.includes("일정 미정");
              const formattedDescription = todo.description
                ? todo.description.replace(/^\[메일\]/i, "[Mail]")
                : undefined;

              return (
                <div
                  key={todo.id}
                  className={`flex flex-col justify-between gap-3.5 p-4 rounded-2xl border shadow-sm transition-all ${
                    isTodoSelected
                      ? "bg-slate-900/90 border-rose-500/50 ring-1 ring-rose-500/20"
                      : todo.completed
                      ? "bg-slate-950/40 border-slate-800/40 opacity-60"
                      : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Card Header: Checkbox + Priority/Due + Delete */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isTodoSelected}
                          onChange={() => handleToggleSelectTodo(todo.id)}
                          className="h-4 w-4 rounded border-slate-700 accent-[#1A73E8] cursor-pointer shrink-0"
                          aria-label={`${todo.title} 선택`}
                        />
                        {priorityBadge(todo.priority)}
                        {hasConfirmedDue && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/70">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{todo.dueDate}</span>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(todo.id)}
                        className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                        삭제
                      </button>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-1">
                      <p
                        className={`text-sm font-semibold break-words leading-snug ${
                          todo.completed ? "line-through text-slate-500" : "text-slate-100"
                        }`}
                      >
                        {todo.title}
                      </p>
                      {formattedDescription && (
                        <p className="text-xs text-slate-400 break-words leading-relaxed">
                          {formattedDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={registeringTodoIds.includes(todo.id)}
                      onClick={() => openTaskConfirmDialog(todo)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title={`Google Tasks '${assistantName}' 목록에 등록`}
                    >
                      {registeringTodoIds.includes(todo.id) ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckSquare className="w-3.5 h-3.5" />
                      )}
                      해야 할 일로 등록
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Dialog for Calendar / Task Registration */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl border ${
                    confirmDialog.type === "calendar"
                      ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                      : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  }`}
                >
                  {confirmDialog.type === "calendar" ? (
                    <Calendar className="w-4 h-4" />
                  ) : (
                    <CheckSquare className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {confirmDialog.type === "calendar"
                      ? "Google Calendar 등록 확인"
                      : "Google Tasks 등록 확인"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    대상 {confirmDialog.type === "calendar" ? "캘린더" : "목록"}: {assistantName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              id="confirm-register-form"
              onSubmit={handleConfirmSubmit}
              className="p-5 space-y-3.5"
            >
              {dialogError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 break-words">
                  {dialogError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  {confirmDialog.type === "calendar" ? "일정 제목" : "할 일 제목"}
                </label>
                <input
                  type="text"
                  value={confirmDialog.title}
                  onChange={(e) =>
                    setConfirmDialog({ ...confirmDialog, title: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              {confirmDialog.type === "calendar" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        날짜
                      </label>
                      <input
                        type="date"
                        value={confirmDialog.date}
                        onChange={(e) =>
                          setConfirmDialog({
                            ...confirmDialog,
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
                        value={confirmDialog.startClock}
                        onChange={(e) => {
                          const nextStart = e.target.value;
                          let nextEnd = confirmDialog.endClock;
                          if (nextStart && (!nextEnd || nextEnd <= nextStart)) {
                            const [h, m] = nextStart.split(":").map(Number);
                            const total = Math.min(23 * 60 + 59, h * 60 + m + 60);
                            nextEnd = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                          }
                          setConfirmDialog({
                            ...confirmDialog,
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
                        value={confirmDialog.endClock}
                        onChange={(e) =>
                          setConfirmDialog({
                            ...confirmDialog,
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
                      value={confirmDialog.location}
                      onChange={(e) =>
                        setConfirmDialog({
                          ...confirmDialog,
                          location: e.target.value,
                        })
                      }
                      placeholder="장소 (선택)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    기한
                  </label>
                  <input
                    type="date"
                    value={
                      /^\d{4}-\d{2}-\d{2}$/.test(confirmDialog.dueDate)
                        ? confirmDialog.dueDate
                        : ""
                    }
                    onChange={(e) =>
                      setConfirmDialog({
                        ...confirmDialog,
                        dueDate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  설명 / 메모
                </label>
                <textarea
                  rows={3}
                  value={confirmDialog.description}
                  onChange={(e) =>
                    setConfirmDialog({
                      ...confirmDialog,
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
                onClick={() => setConfirmDialog(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                취소
              </button>
              <button
                type="submit"
                form="confirm-register-form"
                disabled={
                  (confirmDialog.type === "calendar" &&
                    registeringEventIds.includes(confirmDialog.ev.id)) ||
                  (confirmDialog.type === "task" &&
                    registeringTodoIds.includes(confirmDialog.todo.id))
                }
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
                  confirmDialog.type === "calendar"
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                {((confirmDialog.type === "calendar" &&
                  registeringEventIds.includes(confirmDialog.ev.id)) ||
                  (confirmDialog.type === "task" &&
                    registeringTodoIds.includes(confirmDialog.todo.id))) && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {confirmDialog.type === "calendar"
                  ? "Google Calendar에 등록"
                  : "Google Tasks에 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
