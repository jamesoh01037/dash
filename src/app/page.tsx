"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ChatInterface from "@/components/chat/ChatInterface";
import TodoDashboard from "@/components/todos/TodoDashboard";
import MemoryViewer from "@/components/memory/MemoryViewer";
import GmailDashboard from "@/components/gmail/GmailDashboard";
import ContactsDashboard from "@/components/contacts/ContactsDashboard";
import GoogleChatDashboard from "@/components/google-chat/GoogleChatDashboard";
import GoogleDriveDashboard from "@/components/google-drive/GoogleDriveDashboard";
import JuniorNotificationDashboard from "@/components/notifications/JuniorNotificationDashboard";
import SettingsModal from "@/components/settings/SettingsModal";
import { ChatSession, JuniorNotificationItem } from "@/lib/db";
import {
  BellRing,
  MessageSquare,
  CheckSquare,
  Brain,
  Bell,
  Layers,
} from "lucide-react";

export default function Home() {
  const [currentTab, setCurrentTab] = useState<
    | "chat"
    | "todos"
    | "memory"
    | "notifications"
    | "gmail"
    | "contacts"
    | "gchat"
    | "gdrive"
  >("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("default-session");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [model, setModel] = useState("gemini-3.8-flash");
  const [userName, setUserName] = useState("사용자");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | undefined>();
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [latestPopupNotification, setLatestPopupNotification] =
    useState<JuniorNotificationItem | null>(null);

  const fetchNotificationBadge = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setUnreadNotificationCount(data.unreadCount || 0);
      }
    } catch {
      // silent
    }
  };

  /**
   * 5-minute background watcher.
   * Strictly follows user rule: if there is nothing new to notify (newCount === 0),
   * do NOT send or display any notification at all.
   */
  const runSilentFiveMinuteCheck = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check_now" }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadNotificationCount(data.unreadCount || 0);
        if (data.newCount > 0 && Array.isArray(data.newNotifications) && data.newNotifications[0]) {
          setLatestPopupNotification(data.newNotifications[0]);
          setRefreshKey((prev) => prev + 1);
        }
      }
    } catch {
      // silent
    }
  };

  // Load Sessions and Settings on mount + responsive sidebar init + 5-minute background interval
  useEffect(() => {
    fetchSessions();
    fetchSettings();
    fetchNotificationBadge();
    runSilentFiveMinuteCheck();

    if (typeof window !== "undefined") {
      // Default closed on mobile/tablet (< 1024px), open on desktop (>= 1024px)
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }

      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "gmail") {
        setCurrentTab("gmail");
      } else if (tabParam === "gchat") {
        setCurrentTab("gchat");
      } else if (tabParam === "contacts") {
        setCurrentTab("contacts");
      } else if (tabParam === "gdrive") {
        setCurrentTab("gdrive");
      } else if (tabParam === "notifications") {
        setCurrentTab("notifications");
      }
    }

    const fiveMinTimer = setInterval(() => {
      runSilentFiveMinuteCheck();
    }, 5 * 60 * 1000);

    return () => clearInterval(fiveMinTimer);
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        const sessList = data.sessions || [];
        setSessions(sessList);
        if (sessList.length > 0 && !sessList.some((s: ChatSession) => s.id === activeSessionId)) {
          setActiveSessionId(sessList[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.settings?.model) setModel(data.settings.model);
        if (data.settings?.userName) setUserName(data.settings.userName);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  };

  const handleNewSession = async (customTitle?: string) => {
    const titleToUse = customTitle?.trim() || "새로운 대화";
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleToUse }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchSessions();
        setActiveSessionId(data.session.id);
        setCurrentTab("chat");
        if (typeof window !== "undefined" && window.innerWidth < 1024) {
          setIsSidebarOpen(false);
        }
      }
    } catch (err) {
      console.error("Failed to create new session:", err);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeSessionId === id && remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const triggerDataRefresh = () => {
    setRefreshKey((prev) => prev + 1);
    fetchSessions();
    fetchNotificationBadge();
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F8FAFD] text-[#1F1F1F]">
      {/* Mobile / Tablet Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Responsive Sidebar (Slide-over drawer on <1024px, collapsible column on >=1024px) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 lg:static h-full transition-transform duration-200 ease-in-out ${
          isSidebarOpen
            ? "translate-x-0 lg:block"
            : "-translate-x-full lg:hidden"
        }`}
      >
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setCurrentTab(tab);
            if (typeof window !== "undefined" && window.innerWidth < 1024) {
              setIsSidebarOpen(false);
            }
          }}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            if (typeof window !== "undefined" && window.innerWidth < 1024) {
              setIsSidebarOpen(false);
            }
          }}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onCloseMobile={() => setIsSidebarOpen(false)}
          userName={userName}
          model={model}
          unreadNotificationCount={unreadNotificationCount}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full min-w-0 relative bg-[#F8FAFD]">
        <Header
          currentTab={currentTab}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          model={model}
          userName={userName}
        />

        {/* Floating Notification Toast (ONLY appears when a new notification actually arrives) */}
        {latestPopupNotification && (
          <div className="fixed top-16 right-3 sm:right-6 left-3 sm:left-auto z-50 sm:max-w-md w-auto sm:w-full bg-white border border-[#DDE3EA] rounded-2xl p-4 shadow-xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1A73E8]">
                <BellRing className="w-4 h-4 shrink-0 text-[#FBBC05]" />
                <span>Junior 알림 — 새로운 항목 감지!</span>
              </div>
              <button
                onClick={() => setLatestPopupNotification(null)}
                className="text-[11px] text-[#5F6368] hover:text-[#1F1F1F]"
              >
                닫기
              </button>
            </div>
            <p className="text-xs font-semibold text-[#1F1F1F] truncate">
              {latestPopupNotification.fileName} (발신/작성: {latestPopupNotification.ownerName})
            </p>
            <p className="text-[11px] text-[#444746] line-clamp-2 whitespace-pre-line">
              {latestPopupNotification.summary}
            </p>
            <div className="flex items-center justify-between pt-1 text-[11px]">
              <span className="text-[#188038] font-medium">
                할 일 {latestPopupNotification.myTodosRegistered.length}건 · 일정{" "}
                {latestPopupNotification.calendarEventsRegistered.length}건 자동 등록됨
              </span>
              <button
                onClick={() => {
                  setLatestPopupNotification(null);
                  setCurrentTab("notifications");
                }}
                className="px-3 py-1 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-semibold"
              >
                Junior 알림 보기
              </button>
            </div>
          </div>
        )}

        {/* Google Workspace Rounded White Card Surface */}
        <main className="flex-1 min-h-0 overflow-hidden bg-white lg:mr-3 lg:mb-3 lg:rounded-2xl border-t lg:border border-[#DDE3EA] shadow-2xs">
          {currentTab === "chat" && (
            <ChatInterface
              key={activeSessionId}
              sessionId={activeSessionId}
              initialPrompt={pendingChatPrompt}
              onClearInitialPrompt={() => setPendingChatPrompt(undefined)}
              onRefreshData={triggerDataRefresh}
            />
          )}

          {currentTab === "todos" && (
            <TodoDashboard
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
            />
          )}

          {currentTab === "memory" && (
            <MemoryViewer
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
            />
          )}

          {currentTab === "notifications" && (
            <JuniorNotificationDashboard
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
              onNavigateTab={(tab) => setCurrentTab(tab)}
              onTriggerChatPrompt={(prompt) => {
                setPendingChatPrompt(prompt);
                setCurrentTab("chat");
              }}
            />
          )}

          {currentTab === "gmail" && (
            <GmailDashboard
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
              onTriggerChatPrompt={(prompt) => {
                setPendingChatPrompt(prompt);
                setCurrentTab("chat");
              }}
            />
          )}

          {currentTab === "contacts" && (
            <ContactsDashboard
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
              onTriggerChatPrompt={(prompt) => {
                setPendingChatPrompt(prompt);
                setCurrentTab("chat");
              }}
            />
          )}

          {currentTab === "gchat" && (
            <GoogleChatDashboard
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
              onTriggerChatPrompt={(prompt) => {
                setPendingChatPrompt(prompt);
                setCurrentTab("chat");
              }}
            />
          )}

          {currentTab === "gdrive" && (
            <GoogleDriveDashboard
              key={refreshKey}
              onRefreshTrigger={triggerDataRefresh}
              onTriggerChatPrompt={(prompt) => {
                setPendingChatPrompt(prompt);
                setCurrentTab("chat");
              }}
            />
          )}
        </main>

        {/* Responsive Mobile Bottom Navigation Bar (< 1024px) */}
        <nav className="lg:hidden flex items-center justify-around bg-[#F8FAFD] border-t border-[#DDE3EA] px-1 py-1.5 shrink-0 select-none">
          <button
            onClick={() => setCurrentTab("chat")}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-colors ${
              currentTab === "chat"
                ? "text-[#0B57D0] font-semibold bg-[#D3E3FD]/60"
                : "text-[#5F6368]"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>작업 목록</span>
          </button>

          <button
            onClick={() => setCurrentTab("todos")}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-colors ${
              currentTab === "todos"
                ? "text-[#0B57D0] font-semibold bg-[#D3E3FD]/60"
                : "text-[#5F6368]"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>확인필요</span>
          </button>

          <button
            onClick={() => setCurrentTab("memory")}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-colors ${
              currentTab === "memory"
                ? "text-[#0B57D0] font-semibold bg-[#D3E3FD]/60"
                : "text-[#5F6368]"
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>당부사항</span>
          </button>

          <button
            onClick={() => setCurrentTab("notifications")}
            className={`relative flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-colors ${
              currentTab === "notifications"
                ? "text-[#0B57D0] font-semibold bg-[#D3E3FD]/60"
                : "text-[#5F6368]"
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>보고</span>
            {unreadNotificationCount > 0 && (
              <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-[#EA4335] text-white text-[9px] font-bold flex items-center justify-center">
                {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsSidebarOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-colors ${
              currentTab === "gmail" ||
              currentTab === "contacts" ||
              currentTab === "gchat" ||
              currentTab === "gdrive"
                ? "text-[#0B57D0] font-semibold bg-[#D3E3FD]/60"
                : "text-[#5F6368]"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>전체메뉴</span>
          </button>
        </nav>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => {
          fetchSettings();
          triggerDataRefresh();
        }}
      />
    </div>
  );
}
