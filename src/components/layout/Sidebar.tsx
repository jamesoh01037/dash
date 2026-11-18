"use client";

import React from "react";
import { ChatSession } from "@/lib/db";
import { AppTab } from "@/lib/navigation";
import {
  MessageSquare,
  CheckSquare,
  Brain,
  Users,
  Trash2,
  Settings,
  User,
  Bell,
  X,
  LogOut,
  Target,
  Wallet,
  BarChart3,
  Building2,
  FileCheck2,
  ShoppingCart,
  Megaphone,
  FlaskConical,
  FolderKanban,
  BookOpen,
  Briefcase,
  Inbox,
} from "lucide-react";

interface SidebarProps {
  currentTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: (customTitle?: string) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onCloseMobile?: () => void;
  onLogout?: () => void;
  userName: string;
  userOrg?: string;
  assistantName?: string;
  authEmail?: string;
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
  onLogout,
  userName,
  userOrg,
  assistantName = "Junior",
  authEmail,
  model,
  unreadNotificationCount = 0,
}: SidebarProps) {
  return (
    <aside className="w-72 sm:w-64 h-full bg-[#F8FAFD] border-r border-[#DDE3EA] flex flex-col justify-between shrink-0 select-none">
      {/* Top Brand */}
      <div className="p-3.5 pb-2 space-y-3">
        <div className="flex items-center justify-between px-1.5">
          <div className="flex items-center gap-2.5">
            {/* lloomm AI Workspace Logo */}
            <div className="w-9 h-9 rounded-2xl bg-white border border-[#DDE3EA] overflow-hidden flex items-center justify-center shadow-sm shrink-0">
              <img
                src="/dash-logo.jpg"
                alt="lloomm AI Workspace"
                className="w-full h-full object-cover scale-110"
              />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#1F1F1F] flex items-center gap-1.5 tracking-tight">
                lloomm
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#D3E3FD] text-[#0B57D0] font-semibold whitespace-nowrap max-w-[140px] truncate" title={userOrg || "AI Workspace"}>
                  {userOrg || "AI Workspace"}
                </span>
              </h1>
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
      </div>

      {/* Scrollable Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3.5 py-2 space-y-4">
        {/* 1. Personal Work */}
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-bold text-[#5F6368] tracking-wide mb-1">
            Personal Work
          </p>

          {/* 대화 */}
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <button
                onClick={() => onNewSession("대화")}
                className="w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6] transition-all"
              >
                <MessageSquare className="w-4 h-4 text-[#1A73E8]" />
                <span>대화</span>
              </button>
            ) : (
              sessions.map((s) => {
                const displayTitle =
                  s.title === "Junior와의 첫 번째 대화" || s.title === "새로운 대화"
                    ? "대화"
                    : s.title;
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
                      <span className="truncate">{displayTitle}</span>
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

          {/* 알림 */}
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
              <span>알림</span>
            </div>
            {unreadNotificationCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#EA4335] text-white font-bold text-[10px]">
                {unreadNotificationCount}
              </span>
            )}
          </button>

          {/* 확인사항 */}
          <button
            onClick={() => onSelectTab("todos")}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
              currentTab === "todos"
                ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <CheckSquare className="w-4 h-4 text-[#188038]" />
            <span>확인사항</span>
          </button>

          {/* JD&KPI */}
          <button
            onClick={() => onSelectTab("jd_kpi")}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
              currentTab === "jd_kpi"
                ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <Target className="w-4 h-4 text-[#0B57D0]" />
            <span>JD&amp;KPI</span>
          </button>
        </div>

        {/* 2. MIS, 3. Groupware, 4. PMS */}
        {[
          {
            heading: "MIS",
            items: [
              { id: "mis_finance" as AppTab, label: "자금 / 회계", icon: Wallet, color: "text-[#0D652D]" },
              { id: "mis_hr" as AppTab, label: "인사", icon: Users, color: "text-[#1967D2]" },
              { id: "mis_performance" as AppTab, label: "실적평가", icon: BarChart3, color: "text-[#B06000]" },
              { id: "mis_sales" as AppTab, label: "영업관리", icon: Briefcase, color: "text-[#1A73E8]" },
              { id: "mis_company" as AppTab, label: "회사정보", icon: Building2, color: "text-[#5F6368]" },
            ],
          },
          {
            heading: "Groupware",
            items: [
              { id: "gw_approval" as AppTab, label: "전자결재", icon: FileCheck2, color: "text-[#1A73E8]" },
              { id: "gw_received_approval" as AppTab, label: "내가 받은 결재", icon: Inbox, color: "text-[#188038]" },
              { id: "gw_purchase" as AppTab, label: "구매", icon: ShoppingCart, color: "text-[#E37400]" },
              { id: "gw_notice" as AppTab, label: "Notice & BBS", icon: Megaphone, color: "text-[#D93025]" },
            ],
          },
          {
            heading: "PMS",
            items: [
              { id: "pms_rnd" as AppTab, label: "R&D", icon: FlaskConical, color: "text-[#7627BB]" },
              { id: "pms_project" as AppTab, label: "Project", icon: FolderKanban, color: "text-[#007B83]" },
            ],
          },
        ].map((section) => (
          <div key={section.heading} className="space-y-1 pt-1 border-t border-[#E6ECF3]">
            <p className="px-3 pt-2 text-[11px] font-bold text-[#5F6368] tracking-wide mb-1">
              {section.heading}
            </p>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                      : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* 5. Knowledge */}
        <div className="space-y-1 pt-1 border-t border-[#E6ECF3]">
          <button
            onClick={() => onSelectTab("knowledge")}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-semibold transition-all ${
              currentTab === "knowledge"
                ? "bg-[#D3E3FD] text-[#041E49]"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <BookOpen className="w-4 h-4 text-[#007B83]" />
            <span>Knowledge</span>
          </button>
        </div>

        {/* AI Agent */}
        <div className="space-y-1 pt-1 border-t border-[#E6ECF3]">
          <p className="px-3 pt-2 text-[11px] font-bold text-[#5F6368] tracking-wide mb-1">
            {assistantName}
          </p>

          {/* 장기기억 설정 */}
          <button
            onClick={() => onSelectTab("memory")}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
              currentTab === "memory"
                ? "bg-[#D3E3FD] text-[#041E49] font-semibold"
                : "text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6]"
            }`}
          >
            <Brain className="w-4 h-4 text-[#9334E6]" />
            <span>장기기억 설정</span>
          </button>
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
              <p className="text-[10px] text-[#5F6368] truncate">
                {authEmail || model}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onOpenSettings}
              className="p-2 text-[#5F6368] hover:text-[#1F1F1F] hover:bg-[#E1E7F0] rounded-full transition-colors"
              title="AI 모델 및 환경 설정"
            >
              <Settings className="w-4 h-4" />
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 text-[#5F6368] hover:text-[#D93025] hover:bg-[#FCE8E6] rounded-full transition-colors"
                title="Google 계정 로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
