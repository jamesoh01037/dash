"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChatSession } from "@/lib/db";
import {
  MessageSquare,
  CheckSquare,
  Brain,
  Mail,
  Users,
  MessageCircle,
  HardDrive,
  Plus,
  Trash2,
  Settings,
  Bot,
  User,
  ChevronDown,
  ChevronRight,
  Layers,
  Bell,
  X,
  Sparkles,
} from "lucide-react";

interface SidebarProps {
  currentTab:
    | "chat"
    | "todos"
    | "memory"
    | "notifications"
    | "gmail"
    | "contacts"
    | "gchat"
    | "gdrive";
  onSelectTab: (
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
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: (customTitle?: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onCloseMobile?: () => void;
  userName: string;
  model: string;
  unreadNotificationCount?: number;
}

export default function Sidebar({
  currentTab,
  onSelectTab,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
  onCloseMobile,
  userName,
  model,
  unreadNotificationCount = 0,
}: SidebarProps) {
  const isGoogleServiceTab =
    currentTab === "gmail" ||
    currentTab === "contacts" ||
    currentTab === "gchat" ||
    currentTab === "gdrive";

  // "Google Service 설정" starts collapsed by default on startup
  const [isGoogleMenuOpen, setIsGoogleMenuOpen] = useState<boolean>(false);

  // Prompt state for "+ New 주제 대화"
  const [isNewTopicPromptOpen, setIsNewTopicPromptOpen] = useState<boolean>(false);
  const [newTopicTitle, setNewTopicTitle] = useState<string>("");
  const topicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isGoogleServiceTab) {
      setIsGoogleMenuOpen(true);
    }
  }, [isGoogleServiceTab]);

  useEffect(() => {
    if (isNewTopicPromptOpen) {
      setTimeout(() => {
        topicInputRef.current?.focus();
      }, 50);
    }
  }, [isNewTopicPromptOpen]);

  const handleOpenNewTopicPrompt = () => {
    setNewTopicTitle("");
    setIsNewTopicPromptOpen(true);
  };

  const handleConfirmNewTopic = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newTopicTitle.trim() || "새로운 대화";
    setIsNewTopicPromptOpen(false);
    setNewTopicTitle("");
    onNewSession(trimmed);
  };

  return (
    <aside className="w-72 sm:w-64 h-full bg-[#F8FAFD] border-r border-[#DDE3EA] flex flex-col justify-between shrink-0 select-none">
      {/* Top Brand & "+ New 주제 대화" Button */}
      <div className="p-3.5 pb-2 space-y-3">
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2.5">
            {/* Google 4-color Accent Badge */}
            <div className="relative w-9 h-9 rounded-2xl bg-white border border-[#DDE3EA] flex items-center justify-center text-[#1A73E8] shadow-sm">
              <Bot className="w-5 h-5 text-[#1A73E8]" />
              <span className="absolute -bottom-0.5 -right-0.5 flex gap-0.5 bg-white px-1 py-0.5 rounded-full border border-[#DDE3EA]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4285F4]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#EA4335]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBBC05]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#34A853]" />
              </span>
            </div>
            <div>
              <h1 className="text-base font-bold text-[#1F1F1F] flex items-center gap-1.5 tracking-tight">
                Junior
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D3E3FD] text-[#0B57D0] font-semibold">
                  Workspace
                </span>
              </h1>
              <p className="text-[11px] text-[#5F6368] font-medium">{userName}님의 전담 AI 비서</p>
            </div>
          </div>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-full text-[#5F6368] hover:text-[#1F1F1F] hover:bg-[#E9EEF6] transition-colors"
              aria-label="사이드바 닫기"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* "+ New 주제 대화" Button */}
        <button
          onClick={handleOpenNewTopicPrompt}
          className="w-full py-2.5 px-4 bg-white hover:bg-[#EDF2FA] border border-[#DDE3EA] text-[#0B57D0] rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow"
        >
          <Plus className="w-4 h-4 text-[#1A73E8]" /> New 주제 대화
        </button>

        {/* Dialog / Inline Prompt asking for the conversation topic title */}
        {isNewTopicPromptOpen && (
          <form
            onSubmit={handleConfirmNewTopic}
            className="p-3 rounded-2xl bg-white border border-[#1A73E8]/50 shadow-md space-y-2.5 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-[#0B57D0] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#1A73E8]" />
                새로운 대화의 제목은 무엇인가요?
              </label>
              <button
                type="button"
                onClick={() => setIsNewTopicPromptOpen(false)}
                className="text-[#5F6368] hover:text-[#1F1F1F] p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              ref={topicInputRef}
              type="text"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              placeholder="예: 4분기 마케팅 전략 회의, 메일 브리핑..."
              className="w-full px-3 py-1.5 text-xs rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-[#1F1F1F] placeholder-[#5F6368] focus:outline-none focus:border-[#1A73E8]"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setIsNewTopicPromptOpen(false)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#5F6368] hover:bg-[#EAEFF6]"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow-2xs"
              >
                대화 시작
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Scrollable Navigation Sections (1. Junior / 2. 비서업무 / 3. 설정) */}
      <div className="flex-1 overflow-y-auto px-3.5 py-2 space-y-4">
        {/* 1. Junior */}
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-bold text-[#5F6368] tracking-wide mb-1">
            1. Junior
          </p>

          {/* 비서로써의 당부사항 */}
          <button
            onClick={() => onSelectTab("memory")}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
              currentTab === "memory"
                ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <Brain className="w-4 h-4 text-[#9334E6]" />
            <span>비서로써의 당부사항</span>
          </button>
        </div>

        {/* 2. 비서업무 (구 "최근 대화 기록") */}
        <div className="space-y-1 pt-1 border-t border-[#E6ECF3]">
          <p className="px-3 pt-2 text-[11px] font-bold text-[#5F6368] tracking-wide mb-1">
            2. 비서업무
          </p>

          {/* a. 새로운 대화 (및 생성된 주제 대화 목록) */}
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <button
                onClick={() => onNewSession("새로운 대화")}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6] transition-all"
              >
                <MessageSquare className="w-4 h-4 text-[#1A73E8]" />
                <span>새로운 대화</span>
              </button>
            ) : (
              sessions.map((s, idx) => {
                const displayTitle =
                  s.title === "Junior와의 첫 번째 대화" ? "새로운 대화" : s.title;
                const isActive = s.id === activeSessionId && currentTab === "chat";
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onSelectSession(s.id);
                      onSelectTab("chat");
                    }}
                    className={`group flex items-center justify-between px-3.5 py-2 rounded-full text-xs cursor-pointer transition-all ${
                      isActive
                        ? "bg-[#E8F0FE] text-[#0B57D0] font-semibold"
                        : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <MessageSquare className="w-4 h-4 shrink-0 text-[#1A73E8]" />
                      <span className="truncate">
                        {idx === 0 && displayTitle === "새로운 대화"
                          ? "새로운 대화"
                          : displayTitle}
                      </span>
                    </div>
                    {sessions.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[#5F6368] hover:text-[#D93025] transition-opacity rounded-full"
                        title="대화 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* b. 보고 (구 "Junior 알림") */}
          <button
            onClick={() => onSelectTab("notifications")}
            className={`w-full flex items-center justify-between px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
              currentTab === "notifications"
                ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-[#E37400]" />
              <span>보고</span>
            </div>
            {unreadNotificationCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#EA4335] text-white font-bold text-[10px]">
                {unreadNotificationCount}
              </span>
            )}
          </button>

          {/* c. 확인필요사항 */}
          <button
            onClick={() => onSelectTab("todos")}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
              currentTab === "todos"
                ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <CheckSquare className="w-4 h-4 text-[#188038]" />
            <span>확인필요사항</span>
          </button>
        </div>

        {/* 3. 설정 */}
        <div className="space-y-1 pt-1 border-t border-[#E6ECF3]">
          <p className="px-3 pt-2 text-[11px] font-bold text-[#5F6368] tracking-wide mb-1">
            3. 설정
          </p>

          {/* a. Google Service 설정 (시작 시 접혀 있는 상태) */}
          <div>
            <button
              onClick={() => setIsGoogleMenuOpen(!isGoogleMenuOpen)}
              className={`w-full flex items-center justify-between px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
                isGoogleServiceTab
                  ? "bg-[#E8F0FE] text-[#0B57D0]"
                  : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-[#1A73E8]" />
                <span>Google Service 설정</span>
              </div>
              {isGoogleMenuOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-[#5F6368]" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-[#5F6368]" />
              )}
            </button>

            {isGoogleMenuOpen && (
              <div className="mt-1 ml-4 pl-2.5 border-l-2 border-[#D3E3FD] space-y-1">
                <button
                  onClick={() => onSelectTab("gmail")}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    currentTab === "gmail"
                      ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                      : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
                  }`}
                >
                  <Mail className="w-3.5 h-3.5 text-[#EA4335]" />
                  <span>Gmail 메일함</span>
                </button>

                <button
                  onClick={() => onSelectTab("contacts")}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    currentTab === "contacts"
                      ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                      : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-[#1A73E8]" />
                  <span>Google 주소록</span>
                </button>

                <button
                  onClick={() => onSelectTab("gchat")}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    currentTab === "gchat"
                      ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                      : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#34A853]" />
                  <span>Google Chat</span>
                </button>

                <button
                  onClick={() => onSelectTab("gdrive")}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    currentTab === "gdrive"
                      ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                      : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5 text-[#FBBC05]" />
                  <span>Google 드라이브</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User & Settings Footer */}
      <div className="p-3 border-t border-[#DDE3EA] bg-[#F1F5FB]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#1A73E8] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              {userName ? userName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#1F1F1F] truncate">{userName}</p>
              <p className="text-[10px] text-[#5F6368] truncate">{model}</p>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 text-[#5F6368] hover:text-[#1F1F1F] hover:bg-[#E1E7F0] rounded-full transition-colors"
            title="AI 모델 및 환경 설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
