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
import ApprovalFlowDashboard from "@/components/approval/ApprovalFlowDashboard";
import SettingsModal from "@/components/settings/SettingsModal";
import LoginScreen from "@/components/auth/LoginScreen";
import OnboardingDialog from "@/components/auth/OnboardingDialog";
import { ChatSession, JuniorNotificationItem } from "@/lib/db";
import { AppTab, PLACEHOLDER_TAB_META, PlaceholderTab } from "@/lib/navigation";
import {
  BellRing,
  MessageSquare,
  CheckSquare,
  Brain,
  Bell,
  Layers,
  Loader2,
} from "lucide-react";

export default function Home() {
  const [currentTab, setCurrentTab] = useState<AppTab>("chat");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("default-session");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [model, setModel] = useState("gemini-3.8-flash");
  const [userName, setUserName] = useState("사용자");
  const [userOrg, setUserOrg] = useState<string | undefined>();
  const [assistantName, setAssistantName] = useState("Junior");
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | undefined>();
  const [googleDisplayName, setGoogleDisplayName] = useState<string | undefined>();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [hasOAuthConfig, setHasOAuthConfig] = useState(true);
  const [oauthClientIdPrefix, setOauthClientIdPrefix] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
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
   * Auto-registers Google Drive / Gmail real-time webhooks when deployed on HTTPS.
   * On localhost, skips 5-minute polling so the user triggers checks via "즉시 체크".
   */
  const syncWebhookRegistration = async () => {
    try {
      const statusRes = await fetch("/api/google/watch");
      if (!statusRes.ok) return;
      const { status } = await statusRes.json();
      if (status?.isPublicHttps && (!status.driveWatchActive || (status.hasPubSubTopic && !status.gmailWatchActive))) {
        await fetch("/api/google/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register" }),
        });
      }
    } catch {
      // silent
    }
  };

  const checkAuthSession = async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(Boolean(data.authenticated));
        setHasOAuthConfig(Boolean(data.hasOAuthConfig));
        setOauthClientIdPrefix(data.oauthClientIdPrefix || null);
        if (data.user) {
          setAuthEmail(data.user.email);
          setGoogleDisplayName(data.user.googleName);
        }
        if (data.userName) setUserName(data.userName);
        if (data.userOrg) setUserOrg(data.userOrg);
        if (data.assistantName) setAssistantName(data.assistantName);
        if (data.model) setModel(data.model);
        setNeedsOnboarding(Boolean(data.authenticated && !data.onboardingCompleted));
        return Boolean(data.authenticated);
      }
    } catch {
      // silent
    } finally {
      setAuthLoading(false);
    }
    return false;
  };

  // Load auth session first; when authenticated, load data & sync webhook state
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }

      const params = new URLSearchParams(window.location.search);
      const errParam = params.get("auth_error");
      if (errParam) {
        setAuthError(errParam);
      }
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

    checkAuthSession().then((authed) => {
      if (authed) {
        fetchSessions();
        fetchSettings();
        fetchNotificationBadge();
        syncWebhookRegistration();
      }
    });
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
        if (data.settings?.assistantName) setAssistantName(data.settings.assistantName);
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      setIsAuthenticated(false);
      setAuthEmail(undefined);
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

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#F8FAFD] flex flex-col items-center justify-center gap-3 text-[#5F6368]">
        <Loader2 className="w-8 h-8 animate-spin text-[#1A73E8]" />
        <p className="text-xs font-medium">Dash 연결 확인 중...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        hasOAuthConfig={hasOAuthConfig}
        oauthClientIdPrefix={oauthClientIdPrefix}
        initialError={authError}
        onOAuthConfigured={() => checkAuthSession()}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#F8FAFD] text-[#1F1F1F]">
      {needsOnboarding && (
        <OnboardingDialog
          defaultUserName={
            userName && userName !== "사용자" ? userName : googleDisplayName || ""
          }
          defaultAssistantName={assistantName || "Junior"}
          userEmail={authEmail}
          onCompleted={(newUserName, newAssistantName) => {
            setUserName(newUserName);
            setAssistantName(newAssistantName);
            setNeedsOnboarding(false);
            triggerDataRefresh();
          }}
        />
      )}
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
          onLogout={handleLogout}
          userName={userName}
          userOrg={userOrg}
          assistantName={assistantName}
          authEmail={authEmail}
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
          onLogout={handleLogout}
          model={model}
          userName={userName}
          assistantName={assistantName}
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
              userName={userName}
              assistantName={assistantName}
              onClearInitialPrompt={() => setPendingChatPrompt(undefined)}
              onRefreshData={triggerDataRefresh}
            />
          )}

          {currentTab === "todos" && (
            <TodoDashboard
              key={refreshKey}
              userName={userName}
              assistantName={assistantName}
              authEmail={authEmail}
              onRefreshTrigger={triggerDataRefresh}
            />
          )}

          {currentTab === "memory" && (
            <MemoryViewer
              key={refreshKey}
              assistantName={assistantName}
              onRefreshTrigger={triggerDataRefresh}
            />
          )}

          {currentTab === "notifications" && (
            <JuniorNotificationDashboard
              key={refreshKey}
              authEmail={authEmail}
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

          {(currentTab === "gw_approval" || currentTab === "gw_received_approval") && (
            <ApprovalFlowDashboard
              userName={userName}
              viewMode={currentTab === "gw_received_approval" ? "received" : "approval"}
              onTriggerChatPrompt={(prompt) => {
                setPendingChatPrompt(prompt);
                setCurrentTab("chat");
              }}
            />
          )}

          {currentTab !== "gw_approval" &&
            currentTab !== "gw_received_approval" &&
            currentTab in PLACEHOLDER_TAB_META && (() => {
            const meta = PLACEHOLDER_TAB_META[currentTab as PlaceholderTab];
            return (
              <div className="h-full overflow-y-auto p-6 sm:p-10 flex items-center justify-center">
                <div className="max-w-lg w-full bg-white border border-[#DDE3EA] rounded-3xl p-8 text-center shadow-sm space-y-4">
                  <span className="inline-block px-3 py-1 rounded-full bg-[#E8F0FE] text-[#0B57D0] text-[11px] font-semibold">
                    {meta.category}
                  </span>
                  <h2 className="text-xl font-bold text-[#1F1F1F]">
                    {meta.title}
                  </h2>
                  <p className="text-xs font-medium text-[#5F6368]">
                    {meta.subtitle}
                  </p>
                  <p className="text-xs text-[#444746] leading-relaxed bg-[#F8FAFD] border border-[#E6ECF3] rounded-2xl p-4">
                    {meta.description}
                  </p>
                  <button
                    onClick={() => setCurrentTab("chat")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    대화로 돌아가기
                  </button>
                </div>
              </div>
            );
          })()}
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
            <span>대화</span>
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
            <span>확인사항</span>
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
            <span>장기기억</span>
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
            <span>알림</span>
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
