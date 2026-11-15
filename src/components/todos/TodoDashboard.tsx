"use client";

import React, { useState, useEffect } from "react";
import { TodoItem, CalendarEventItem } from "@/lib/db";
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
} from "lucide-react";

interface TodoDashboardProps {
  onRefreshTrigger?: () => void;
}

export default function TodoDashboard({ onRefreshTrigger }: TodoDashboardProps) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [selectedList, setSelectedList] = useState<string>("Junior");
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [newTitle, setNewTitle] = useState("");
  const [newItemType, setNewItemType] = useState<"todo" | "schedule">("todo");
  const [newListName, setNewListName] = useState<string>("Junior");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedTodoIds, setSelectedTodoIds] = useState<string[]>([]);
  const [isBulkDeletingEvents, setIsBulkDeletingEvents] = useState(false);
  const [isBulkDeletingTodos, setIsBulkDeletingTodos] = useState(false);

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
    const itemList = t.listName || "Junior";
    if (selectedList === "ALL") return true;
    return itemList.toLowerCase() === selectedList.toLowerCase();
  });

  const listFilteredEvents = calendarEvents.filter((e) => {
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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">
                할 일 & 일정 &ldquo;Junior&rdquo; 목록 관리
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-junior-500/15 text-junior-300 border border-junior-500/30 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Junior 자동 등록 목록
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Junior가 등록하는 모든 할 일과 일정은 기본적으로 <strong>&ldquo;Junior&rdquo; 목록</strong>에 저장됩니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setSelectedList("Junior")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              selectedList === "Junior"
                ? "bg-junior-600 text-white border-junior-500 shadow-md shadow-junior-600/20"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Junior 목록 (할일 {juniorTodoCount} · 일정 {juniorEventCount})
          </button>
          <button
            onClick={() => setSelectedList("ALL")}
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

      {/* Top Banner / Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {selectedList === "Junior" ? "Junior 목록 할 일" : "전체 할 일"}
            </p>
            <p className="text-2xl font-bold text-slate-100">{listFilteredTodos.length}</p>
          </div>
          <CheckSquare className="w-8 h-8 text-slate-700" />
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">진행 중인 할 일</p>
            <p className="text-2xl font-bold text-junior-400">{pendingCount}</p>
          </div>
          <Circle className="w-8 h-8 text-junior-500/30" />
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">완료된 할 일</p>
            <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
          </div>
          <CheckCircle2 className="w-8 h-8 text-emerald-500/30" />
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {selectedList === "Junior" ? "Junior 목록 일정" : "전체 일정"}
            </p>
            <p className="text-2xl font-bold text-cyan-400">{listFilteredEvents.length}</p>
          </div>
          <Calendar className="w-8 h-8 text-cyan-500/30" />
        </div>
      </div>

      {/* Quick Add Form */}
      <form
        onSubmit={handleAdd}
        className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newItemType}
            onChange={(e) => setNewItemType(e.target.value as "todo" | "schedule")}
            className="px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-junior-500"
          >
            <option value="todo">📋 할 일 등록</option>
            <option value="schedule">📅 일정 등록</option>
          </select>

          <select
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-junior-300 font-semibold focus:outline-none focus:border-junior-500"
          >
            <option value="Junior">목록: Junior</option>
            <option value="기본 목록">목록: 기본 목록</option>
          </select>

          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={
              newItemType === "schedule"
                ? `"${newListName}" 목록에 등록할 새로운 일정을 입력하세요...`
                : `"${newListName}" 목록에 등록할 새로운 할 일을 입력하세요...`
            }
            className="flex-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-junior-500"
          />
          <div className="flex gap-2">
            <select
              value={newPriority}
              onChange={(e) =>
                setNewPriority(e.target.value as "low" | "medium" | "high")
              }
              className="px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-junior-500"
            >
              <option value="high">우선순위: 높음</option>
              <option value="medium">우선순위: 보통</option>
              <option value="low">우선순위: 낮음</option>
            </select>
            <input
              type="text"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              placeholder="기한/일시 (예: 2026-11-20 14:00)"
              className="w-44 px-2.5 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-junior-500"
            />
            <button
              type="submit"
              disabled={!newTitle.trim() || isLoading}
              className="px-4 py-2 bg-junior-600 hover:bg-junior-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" /> 추가
            </button>
          </div>
        </div>
      </form>

      {/* Section 1: Calendar Schedules in "Junior" List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200">
              일정 — &ldquo;{selectedList === "ALL" ? "전체" : selectedList}&rdquo; 목록 ({listFilteredEvents.length}건)
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
            현재 &ldquo;{selectedList === "ALL" ? "전체" : selectedList}&rdquo; 목록에 등록된 일정이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {listFilteredEvents.map((ev) => {
              const isEventSelected = selectedEventIds.includes(ev.id);
              return (
                <div
                  key={ev.id}
                  className={`group p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isEventSelected
                      ? "bg-slate-900/90 border-rose-500/50 ring-1 ring-rose-500/20"
                      : "bg-slate-900/60 border-cyan-500/25 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isEventSelected}
                      onChange={() => handleToggleSelectEvent(ev.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-700 accent-[#1A73E8] cursor-pointer shrink-0"
                      aria-label={`${ev.title} 선택`}
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold shrink-0">
                          목록: {ev.listName || "Junior"}
                        </span>
                        <p className="text-xs font-bold text-slate-100 truncate">
                          📅 {ev.title}
                        </p>
                      </div>
                      <p className="text-[11px] text-cyan-300">일시: {ev.startTime}</p>
                      {ev.description && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {ev.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {ev.googleCalendarLink && (
                      <a
                        href={ev.googleCalendarLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center gap-1"
                      >
                        캘린더 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteSchedule(ev.id)}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 transition-all rounded hover:bg-slate-800"
                      title="일정 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-200">
                할 일 — &ldquo;{selectedList === "ALL" ? "전체" : selectedList}&rdquo; 목록
              </h3>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setFilter("all")}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                  filter === "all"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                전체 ({listFilteredTodos.length})
              </button>
              <button
                onClick={() => setFilter("pending")}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                  filter === "pending"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                진행 중 ({pendingCount})
              </button>
              <button
                onClick={() => setFilter("completed")}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                  filter === "completed"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                완료 ({completedCount})
              </button>
            </div>
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
        <div className="space-y-2">
          {filteredTodos.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              해당 목록에 표시할 할 일이 없습니다.
            </div>
          ) : (
            filteredTodos.map((todo) => {
              const isTodoSelected = selectedTodoIds.includes(todo.id);
              return (
                <div
                  key={todo.id}
                  className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                    isTodoSelected
                      ? "bg-slate-900/90 border-rose-500/50 ring-1 ring-rose-500/20"
                      : todo.completed
                      ? "bg-slate-950/40 border-slate-800/40 opacity-60"
                      : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isTodoSelected}
                      onChange={() => handleToggleSelectTodo(todo.id)}
                      className="h-4 w-4 rounded border-slate-700 accent-[#1A73E8] cursor-pointer shrink-0"
                      aria-label={`${todo.title} 선택`}
                    />
                    <button
                      onClick={() => handleToggleComplete(todo)}
                      className="text-slate-400 hover:text-emerald-400 transition-colors shrink-0"
                    >
                      {todo.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-500 hover:text-slate-300" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-junior-500/15 text-junior-300 border border-junior-500/30 font-semibold shrink-0">
                          목록: {todo.listName || "Junior"}
                        </span>
                        <p
                          className={`text-sm font-medium truncate ${
                            todo.completed ? "line-through text-slate-500" : "text-slate-200"
                          }`}
                        >
                          {todo.title}
                        </p>
                      </div>
                      {todo.description && (
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {todo.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {todo.dueDate && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{todo.dueDate}</span>
                      </div>
                    )}
                    {priorityBadge(todo.priority)}
                    <button
                      onClick={() => handleDelete(todo.id)}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 transition-all rounded hover:bg-slate-800"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
