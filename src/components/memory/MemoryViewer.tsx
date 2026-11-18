"use client";

import React, { useState, useEffect } from "react";
import { MemoryItem } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Brain, Plus, Trash2, Sparkles, User, Pencil, Check, X } from "lucide-react";

interface MemoryViewerProps {
  onRefreshTrigger?: () => void;
  assistantName?: string;
}

export default function MemoryViewer({
  onRefreshTrigger,
  assistantName = "Junior",
}: MemoryViewerProps) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [category, setCategory] = useState<"all" | "personal" | "preference" | "work" | "general">("all");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<"personal" | "preference" | "work" | "general">("preference");
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingCategory, setEditingCategory] = useState<"personal" | "preference" | "work" | "general">("general");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchMemories = async () => {
    try {
      const res = await fetch("/api/memory", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch (err) {
      console.error("Failed to fetch memories:", err);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent.trim(),
          category: newCategory,
        }),
      });

      if (res.ok) {
        setNewContent("");
        await fetchMemories();
        onRefreshTrigger?.();
      }
    } catch (err) {
      console.error("Failed to add memory:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
      onRefreshTrigger?.();
    } catch (err) {
      console.error("Failed to delete memory:", err);
      fetchMemories();
    }
  };

  const handleStartEdit = (mem: MemoryItem) => {
    setEditingId(mem.id);
    setEditingContent(mem.content);
    setEditingCategory(mem.category);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingContent.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          content: editingContent.trim(),
          category: editingCategory,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditingContent("");
        await fetchMemories();
        onRefreshTrigger?.();
      }
    } catch (err) {
      console.error("Failed to update memory:", err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const filteredMemories = memories.filter((m) => {
    if (category === "all") return true;
    return m.category === category;
  });

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "personal":
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">개인 신상</span>;
      case "preference":
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">취향/선호</span>;
      case "work":
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">업무/프로젝트</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 font-medium">일반</span>;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Informative Banner */}
      <div className="p-4 rounded-xl bg-white border border-[#DDE3EA] flex items-start gap-3">
        <Brain className="w-6 h-6 text-[#444746] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-[#1F1F1F]">{assistantName}의 장기 기억 (Personal Knowledge Base)</h3>
          <p className="text-xs text-[#3C4043] leading-relaxed">
            {assistantName}는 대화 중에 말씀하시는 취향, 습관, 프로젝트 목표 등을 자동으로 캐치하여 영구 기억에 저장합니다.
            여기 저장된 기억은 모든 대화의 백그라운드 맥락으로 자동 주입되어 맞춤형 조언을 제공합니다.
          </p>
        </div>
      </div>

      {/* Add Memory Form */}
      <form
        onSubmit={handleAdd}
        className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as "personal" | "preference" | "work" | "general")}
            className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-junior-500 shrink-0"
          >
            <option value="preference">분류: 취향/선호</option>
            <option value="work">분류: 업무/프로젝트</option>
            <option value="personal">분류: 개인 신상</option>
            <option value="general">분류: 일반 사실</option>
          </select>
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={`${assistantName}에게 직접 기억시킬 사실을 입력하세요 (예: 주로 쓰는 에디터는 VS Code이다)...`}
            className="flex-1 px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-junior-500"
          />
          <button
            type="submit"
            disabled={!newContent.trim() || isLoading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> 기억 저장
          </button>
        </div>
      </form>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setCategory("all")}
          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
            category === "all" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          전체 ({memories.length})
        </button>
        <button
          onClick={() => setCategory("preference")}
          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
            category === "preference" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          취향/선호
        </button>
        <button
          onClick={() => setCategory("work")}
          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
            category === "work" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          업무/프로젝트
        </button>
        <button
          onClick={() => setCategory("personal")}
          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
            category === "personal" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          개인 신상
        </button>
        <button
          onClick={() => setCategory("general")}
          className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
            category === "general" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          일반
        </button>
      </div>

      {/* Memories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredMemories.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-500 text-sm">
            저장된 기억이 없습니다.
          </div>
        ) : (
          filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="group relative p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  {editingId === mem.id ? (
                    <select
                      value={editingCategory}
                      onChange={(e) =>
                        setEditingCategory(
                          e.target.value as "personal" | "preference" | "work" | "general"
                        )
                      }
                      className="px-2 py-1 bg-slate-950/80 border border-slate-700 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-junior-500"
                    >
                      <option value="preference">취향/선호</option>
                      <option value="work">업무/프로젝트</option>
                      <option value="personal">개인 신상</option>
                      <option value="general">일반</option>
                    </select>
                  ) : (
                    getCategoryBadge(mem.category)
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    {mem.source === "extracted_by_agent" ? (
                      <span className="flex items-center gap-1 text-purple-400">
                        <Sparkles className="w-3 h-3" /> 대화에서 자동 학습
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-slate-400">
                        <User className="w-3 h-3" /> 직접 등록
                      </span>
                    )}
                  </div>
                </div>

                {editingId === mem.id ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2 bg-slate-950/80 border border-[#1A73E8] rounded-lg text-sm text-slate-200 focus:outline-none resize-y"
                      placeholder="기억 내용을 입력하세요..."
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> 취소
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(mem.id)}
                        disabled={!editingContent.trim() || isSavingEdit}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-40 text-white flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> 저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-200 leading-relaxed font-normal whitespace-pre-wrap">
                    {mem.content}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-500">
                <span>{formatDate(mem.createdAt)}</span>
                {editingId !== mem.id && (
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => handleStartEdit(mem)}
                      className="p-1 text-slate-500 hover:text-[#1A73E8] transition-all rounded hover:bg-slate-800"
                      title="기억 수정"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(mem.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-all rounded hover:bg-slate-800"
                      title="기억 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
