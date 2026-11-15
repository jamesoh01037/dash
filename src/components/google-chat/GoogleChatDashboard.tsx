"use client";

import React, { useState, useEffect } from "react";
import {
  MessageCircle,
  Send,
  RefreshCw,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  KeyRound,
  Webhook,
  CalendarPlus,
  Mail,
  CheckSquare,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Users,
  PlusCircle,
  Edit3,
  Reply,
  Bot,
  SmilePlus,
  Copy,
} from "lucide-react";
import { GoogleChatSpace, GoogleChatMessageLog, GoogleChatMember } from "@/lib/db";

interface AuthStatus {
  authMode: "oauth2" | "service_account" | "token" | "webhook";
  hasAccessToken: boolean;
  hasOAuthClient: boolean;
  hasRefreshToken: boolean;
  hasServiceAccount: boolean;
  connectedEmail?: string;
  connectedAt?: string;
  redirectUri?: string;
}

interface GoogleChatDashboardProps {
  onRefreshTrigger?: () => void;
  onTriggerChatPrompt?: (prompt: string) => void;
}

export default function GoogleChatDashboard({
  onRefreshTrigger,
  onTriggerChatPrompt,
}: GoogleChatDashboardProps) {
  const [spaces, setSpaces] = useState<GoogleChatSpace[]>([]);
  const [messages, setMessages] = useState<GoogleChatMessageLog[]>([]);
  const [members, setMembers] = useState<GoogleChatMember[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authMode: "webhook",
    hasAccessToken: false,
    hasOAuthClient: false,
    hasRefreshToken: false,
    hasServiceAccount: false,
  });
  const [gmailConnected, setGmailConnected] = useState(false);

  const [rightTab, setRightTab] = useState<"messages" | "members" | "bot_webhook">("messages");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modals
  const [showAddSpaceModal, setShowAddSpaceModal] = useState(false);
  const [showCreateSpaceModal, setShowCreateSpaceModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"oauth2" | "service_account" | "token">("oauth2");

  // Add Space (Webhook / Manual ID) Form
  const [spaceName, setSpaceName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [spaceIdInput, setSpaceIdInput] = useState("");
  const [spaceDesc, setSpaceDesc] = useState("");

  // Create Space via API Form
  const [newSpaceDisplayName, setNewSpaceDisplayName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [newSpaceMembers, setNewSpaceMembers] = useState("");

  // Auth Config Form
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [serviceAccountInput, setServiceAccountInput] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");

  // Message / Card Composer Form
  const [quickTitle, setQuickTitle] = useState("");
  const [quickSubtitle, setQuickSubtitle] = useState("");
  const [quickText, setQuickText] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [replyThreadName, setReplyThreadName] = useState("");
  const [useRichCard, setUseRichCard] = useState(true);

  // Editing message state
  const [editingMessageName, setEditingMessageName] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Bot simulator state
  const [botSimInput, setBotSimInput] = useState("오늘 내 미완료 할 일 목록 알려줘");
  const [botSimLoading, setBotSimLoading] = useState(false);

  useEffect(() => {
    fetchChatHub(false);

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gchat_auth") === "success") {
        setStatusMessage({
          type: "success",
          text: "Google 계정 OAuth 2.0 전체 연동이 완료되었으며 스페이스 목록을 동기화했습니다!",
        });
      } else if (params.get("gchat_error")) {
        setStatusMessage({
          type: "error",
          text: `Google Chat OAuth 인증 오류: ${params.get("gchat_error")}`,
        });
      }
    }
  }, []);

  const fetchChatHub = async (sync = false) => {
    if (sync) setSyncing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/google-chat${sync ? "?sync=true" : ""}`);
      if (res.ok) {
        const data = await res.json();
        const loadedSpaces: GoogleChatSpace[] = data.spaces || [];
        setSpaces(loadedSpaces);
        setMessages(data.messages || []);
        if (data.authStatus) setAuthStatus(data.authStatus);
        setGmailConnected(Boolean(data.gmailConnected));

        if (loadedSpaces.length > 0 && !selectedSpaceId) {
          setSelectedSpaceId(loadedSpaces[0].name);
        }
        if (sync) {
          setStatusMessage({
            type: "success",
            text: `Google Chat 전체 스페이스(${loadedSpaces.length}개) 및 실시간 메시지 동기화가 완료되었습니다.`,
          });
        }
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Google Chat 정보를 불러오는 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const fetchSpaceMembers = async (targetSpaceName: string) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(
        `/api/google-chat?members=true&space=${encodeURIComponent(targetSpaceName)}`
      );
      const data = await res.json();
      setMembers(data.members || []);
      if (data.error) {
        setStatusMessage({ type: "error", text: data.error });
      }
    } catch {
      setStatusMessage({ type: "error", text: "스페이스 멤버 조회 중 오류가 발생했습니다." });
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleAddSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spaceName.trim() || (!webhookUrl.trim() && !spaceIdInput.trim())) return;

    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_space",
          name: spaceName.trim(),
          webhookUrl: webhookUrl.trim() || undefined,
          spaceId: spaceIdInput.trim() || undefined,
          description: spaceDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", text: data.error || "스페이스 등록 실패" });
      } else {
        setStatusMessage({ type: "success", text: data.message });
        setSpaceName("");
        setWebhookUrl("");
        setSpaceIdInput("");
        setSpaceDesc("");
        setShowAddSpaceModal(false);
        await fetchChatHub(false);
        if (data.space?.name) setSelectedSpaceId(data.space.name);
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({ type: "error", text: "스페이스 등록 중 네트워크 오류가 발생했습니다." });
    }
  };

  const handleCreateSpaceApi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpaceDisplayName.trim()) return;

    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_space",
          displayName: newSpaceDisplayName.trim(),
          description: newSpaceDesc.trim() || undefined,
          memberEmails: newSpaceMembers.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", text: data.error || "스페이스 생성 실패" });
      } else {
        setStatusMessage({ type: "success", text: data.message });
        setNewSpaceDisplayName("");
        setNewSpaceDesc("");
        setNewSpaceMembers("");
        setShowCreateSpaceModal(false);
        await fetchChatHub(false);
        if (data.space?.name) setSelectedSpaceId(data.space.name);
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({ type: "error", text: "스페이스 생성 중 오류가 발생했습니다." });
    }
  };

  const handleStartOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_oauth_config",
          clientId: clientIdInput.trim() || undefined,
          clientSecret: clientSecretInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", text: data.error || "OAuth 설정 실패" });
      } else if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setStatusMessage({ type: "error", text: "OAuth 요청 중 오류가 발생했습니다." });
    }
  };

  const handleSaveServiceAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_service_account",
          serviceAccountJson: serviceAccountInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ type: "success", text: data.message });
        setShowAuthModal(false);
        setServiceAccountInput("");
        await fetchChatHub(false);
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "서비스 계정 저장 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "서비스 계정 저장 중 오류가 발생했습니다." });
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_token",
          accessToken: accessTokenInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ type: "success", text: data.message });
        setShowAuthModal(false);
        setAccessTokenInput("");
        await fetchChatHub(false);
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "토큰 저장 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "토큰 저장 중 오류가 발생했습니다." });
    }
  };

  const handleDisconnectAuth = async () => {
    try {
      const res = await fetch("/api/auth/google-chat", { method: "DELETE" });
      if (res.ok) {
        setStatusMessage({ type: "success", text: "Google Chat 인증 토큰 연결이 해제되었습니다." });
        await fetchChatHub(false);
      }
    } catch {
      setStatusMessage({ type: "error", text: "연결 해제 실패" });
    }
  };

  const handleDeleteSpace = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/google-chat?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSpaces((prev) => prev.filter((s) => s.id !== id));
        setStatusMessage({ type: "success", text: `'${name}' 스페이스가 삭제되었습니다.` });
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({ type: "error", text: "스페이스 삭제에 실패했습니다." });
    }
  };

  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim()) return;

    setSending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_message",
          spaceNameOrId: selectedSpaceId || undefined,
          title: quickTitle.trim() || (useRichCard ? "🤖 Junior AI 브리핑" : undefined),
          subtitle: quickSubtitle.trim() || undefined,
          text: quickText.trim(),
          buttonText: buttonText.trim() || undefined,
          buttonUrl: buttonUrl.trim() || undefined,
          threadName: replyThreadName.trim() || undefined,
          useCard: useRichCard,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", text: data.error || "메시지 전송 실패" });
      } else {
        setStatusMessage({ type: "success", text: data.message });
        setQuickText("");
        setQuickTitle("");
        setQuickSubtitle("");
        setButtonText("");
        setButtonUrl("");
        setReplyThreadName("");
        await fetchChatHub(false);
      }
    } catch {
      setStatusMessage({ type: "error", text: "메시지 전송 중 오류가 발생했습니다." });
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async (messageName: string, emoji: string) => {
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_reaction",
          messageName,
          emoji,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchChatHub(false);
      } else {
        setStatusMessage({ type: "error", text: data.error || "리액션 실패" });
      }
    } catch {
      // ignore
    }
  };

  const handleUpdateMessage = async (messageName: string) => {
    if (!editingText.trim()) return;
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_message",
          messageName,
          text: editingText.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingMessageName(null);
        setEditingText("");
        setStatusMessage({ type: "success", text: "메시지가 수정되었습니다." });
        await fetchChatHub(false);
      } else {
        setStatusMessage({ type: "error", text: data.error || "메시지 수정 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "메시지 수정 중 오류 발생" });
    }
  };

  const handleDeleteMessage = async (messageName: string) => {
    try {
      const res = await fetch("/api/google-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_message",
          messageName,
        }),
      });
      if (res.ok) {
        setStatusMessage({ type: "success", text: "메시지가 삭제되었습니다." });
        await fetchChatHub(false);
      }
    } catch {
      setStatusMessage({ type: "error", text: "메시지 삭제 중 오류 발생" });
    }
  };

  const handleSimulateBotWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botSimInput.trim()) return;
    setBotSimLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-chat/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MESSAGE",
          space: {
            name: "spaces/LOCAL_BOT_TEST",
            displayName: selectedSpaceId || "Google Chat 봇 테스트방",
            spaceType: "SPACE",
          },
          user: {
            displayName: "나",
          },
          message: {
            name: `spaces/LOCAL_BOT_TEST/messages/${Date.now()}`,
            text: `@Junior ${botSimInput.trim()}`,
            argumentText: botSimInput.trim(),
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: `Junior 양방향 봇 응답 완료: "${String(data.text || "").slice(0, 80)}..."`,
        });
        setRightTab("messages");
        await fetchChatHub(false);
      } else {
        setStatusMessage({ type: "error", text: data.text || "봇 웹훅 응답 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "봇 웹훅 테스트 중 오류가 발생했습니다." });
    } finally {
      setBotSimLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <MessageCircle className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-100">
                Google Chat 전체 연동 허브 (OAuth 2.0 & Chat API v1 확장)
              </h3>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 font-medium">
                {spaces.length}개 스페이스
              </span>
              {authStatus.hasAccessToken ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {authStatus.authMode === "oauth2"
                    ? `OAuth 2.0 연동됨 ${authStatus.connectedEmail ? `(${authStatus.connectedEmail})` : ""}`
                    : authStatus.authMode === "service_account"
                    ? `서비스 계정 봇 연동됨`
                    : "REST API 토큰 활성"}
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  웹훅(Webhook) 기본 모드
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              **OAuth 2.0 자동 갱신**, **Service Account 봇**, **REST API(`v1/spaces`)**, **Incoming Webhook**을 모두 지원합니다.
              스페이스 생성·멤버 조회·Cards v2 브리핑·스레드 답글·메시지 수정/삭제·이모지 리액션 및 양방향 `@Junior` 봇 응답까지 완벽히 연동됩니다.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20 flex items-center gap-1.5 transition-all"
            >
              <KeyRound className="w-3.5 h-3.5" />
              OAuth 2.0 / API 전체 연동 설정
            </button>

            <button
              onClick={() => setShowCreateSpaceModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              새 스페이스 생성 (API)
            </button>

            <button
              onClick={() => setShowAddSpaceModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              <Webhook className="w-3.5 h-3.5 text-emerald-400" />
              + 웹훅/ID 등록
            </button>

            <button
              onClick={() => fetchChatHub(true)}
              disabled={syncing}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              )}
              전체 동기화
            </button>
          </div>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-[11px] opacity-70 hover:opacity-100"
            >
              닫기
            </button>
          </div>
        )}
      </div>

      {/* One-Click AI Automation Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Junior 원클릭 Google Chat API 명령:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                `현재 미완료된 내 할 일(To-Do) 목록을 정리해서 Google Chat ${
                  selectedSpaceId ? `'${selectedSpaceId}'` : ""
                } 스페이스로 Cards v2 브리핑 카드를 보내줘.`
              )
            }
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            오늘의 할 일 카드 전송
          </button>

          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                `내 Gmail에서 최근 중요한 메일들을 3줄 요약해서 Google Chat ${
                  selectedSpaceId ? `'${selectedSpaceId}'` : ""
                } 스페이스로 브리핑 카드를 보내줘.`
              )
            }
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            최근 메일 요약 전송
          </button>

          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                `Google Chat ${
                  selectedSpaceId ? `'${selectedSpaceId}'` : ""
                } 스페이스의 참여 멤버 목록과 최근 대화 내역을 조회해서 핵심 요약을 알려줘.`
              )
            }
            className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            멤버 & 최근 대화 브리핑
          </button>

          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                "최근 Google Chat 메시지 내역을 조회해서 내가 챙겨야 할 회의나 마감 일정을 추출해 줘."
              )
            }
            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            채팅에서 일정/할일 추출
          </button>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connected Spaces & Rich Card Composer (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Spaces Explorer */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Google Chat 스페이스 & DM 탐색기
              </h4>
              <a
                href="https://chat.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
              >
                Google Chat 열기 <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
              </div>
            ) : spaces.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-400 space-y-2">
                <p className="font-semibold text-slate-200">
                  💡 Google Chat 전체 연동 시작하기:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                  <li>
                    <strong>OAuth 2.0 전체 연동</strong>: 상단의{" "}
                    <strong className="text-amber-300">[OAuth 2.0 / API 전체 연동 설정]</strong>에서
                    Google 계정을 연결하면 참여 중인 모든 스페이스·그룹방·DM이 자동 동기화됩니다.
                  </li>
                  <li>
                    <strong>10초 웹훅 연동</strong>: Google Chat 스페이스 이름 →{" "}
                    <strong>[앱 및 통합] → [웹훅]</strong> URL을 복사해{" "}
                    <strong className="text-emerald-300">[+ 웹훅/ID 등록]</strong>으로 추가하세요.
                  </li>
                </ul>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {spaces.map((space) => {
                  const isSelected = selectedSpaceId === space.name;
                  return (
                    <div
                      key={space.id}
                      onClick={() => {
                        setSelectedSpaceId(space.name);
                        if (rightTab === "members") {
                          fetchSpaceMembers(space.name);
                        }
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-amber-500/10 border-amber-500/40 text-slate-100"
                          : "bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-xs text-slate-100 truncate">
                            # {space.name}
                          </span>
                          {space.spaceType && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {space.spaceType}
                            </span>
                          )}
                          {space.webhookUrl && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              Webhook
                            </span>
                          )}
                          {space.spaceId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              {space.spaceId}
                            </span>
                          )}
                        </div>
                        {space.description && (
                          <p className="text-[11px] text-slate-400 truncate">
                            {space.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {space.spaceId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSpaceId(space.name);
                              setRightTab("members");
                              fetchSpaceMembers(space.name);
                            }}
                            className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-lg transition-colors"
                            title="참여 멤버 보기"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSpace(space.id, space.name);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                          title="스페이스 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct Message / Cards v2 Composer */}
          <form
            onSubmit={handleQuickSend}
            className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-amber-400" />
                Google Chat 메시지 & Cards v2 발송기
              </h4>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRichCard}
                  onChange={(e) => setUseRichCard(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                Cards v2 리치 카드
              </label>
            </div>

            {spaces.length > 0 && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">대상 스페이스</label>
                <select
                  value={selectedSpaceId}
                  onChange={(e) => setSelectedSpaceId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} {s.spaceId ? `(${s.spaceId})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {replyThreadName && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                <span className="truncate flex items-center gap-1">
                  <Reply className="w-3 h-3" /> 스레드 답글 대상: <code>{replyThreadName}</code>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyThreadName("")}
                  className="text-slate-400 hover:text-white ml-2"
                >
                  해제
                </button>
              </div>
            )}

            {useRichCard && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="카드 제목 (예: 📋 오늘의 브리핑)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  value={quickSubtitle}
                  onChange={(e) => setQuickSubtitle(e.target.value)}
                  placeholder="부제목 (선택)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div>
              <textarea
                rows={3}
                required
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="전송할 메시지 본문을 입력하세요..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            {useRichCard && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="버튼 텍스트 (예: 회의록 열기)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="url"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="버튼 링크 URL (https://...)"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={sending || spaces.length === 0 || !quickText.trim()}
              className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              {sending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Google Chat으로 전송하기
            </button>
          </form>
        </div>

        {/* Right Column: Messages / Space Members / Interactive Bot Webhook (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col min-h-[480px]">
          {/* Sub-navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setRightTab("messages")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  rightTab === "messages"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-slate-200 bg-slate-950/50"
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                실시간 메시지 ({messages.length})
              </button>

              <button
                onClick={() => {
                  setRightTab("members");
                  if (selectedSpaceId) fetchSpaceMembers(selectedSpaceId);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  rightTab === "members"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-400 hover:text-slate-200 bg-slate-950/50"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                스페이스 참여 멤버
              </button>

              <button
                onClick={() => setRightTab("bot_webhook")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  rightTab === "bot_webhook"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "text-slate-400 hover:text-slate-200 bg-slate-950/50"
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                양방향 @Junior 봇 웹훅
              </button>
            </div>
          </div>

          {/* Tab 1: Messages Feed */}
          {rightTab === "messages" && (
            <>
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-2">
                  <MessageCircle className="w-8 h-8 text-slate-600" />
                  <p className="text-xs text-slate-400">
                    아직 기록된 Google Chat 메시지가 없습니다.
                  </p>
                  <p className="text-[11px] text-slate-500">
                    OAuth 2.0 연동 후 [전체 동기화]를 누르거나 좌측에서 메시지를 전송해 보세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 overflow-y-auto max-h-[540px] pr-1">
                  {messages.map((msg) => {
                    const targetMsgName = msg.messageName || msg.id;
                    const isEditing = editingMessageName === targetMsgName;

                    return (
                      <div
                        key={msg.id}
                        className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`p-1 rounded-md ${
                                msg.direction === "outbound"
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-cyan-500/10 text-cyan-400"
                              }`}
                            >
                              {msg.direction === "outbound" ? (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              )}
                            </span>
                            <span className="text-xs font-bold text-slate-200 truncate">
                              {msg.sender}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-amber-300">
                              {msg.spaceName}
                            </span>
                            {msg.messageName && (
                              <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                                {msg.messageName.split("/").slice(-2).join("/")}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {new Date(msg.createdAt).toLocaleString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {isEditing ? (
                          <div className="pl-7 space-y-2">
                            <textarea
                              rows={2}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-amber-500/40 rounded-lg text-xs text-slate-100"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateMessage(targetMsgName)}
                                className="px-2.5 py-1 rounded bg-amber-600 text-white text-[11px] font-medium"
                              >
                                수정 저장
                              </button>
                              <button
                                onClick={() => setEditingMessageName(null)}
                                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed pl-7">
                            {msg.text}
                          </p>
                        )}

                        {/* Reactions & Message Actions Bar */}
                        <div className="pl-7 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900">
                          {/* Quick Emoji Reactions */}
                          <div className="flex items-center gap-1">
                            {msg.reactions &&
                              msg.reactions.map((r, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px]"
                                >
                                  {r}
                                </span>
                              ))}
                            <div className="flex items-center gap-0.5 ml-1">
                              {["👍", "✅", "❤️", "🚀"].map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReaction(targetMsgName, emoji)}
                                  className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-[11px] opacity-70 hover:opacity-100 transition-opacity"
                                  title={`${emoji} 리액션 추가`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                            {msg.threadName && (
                              <button
                                onClick={() => setReplyThreadName(msg.threadName || "")}
                                className="hover:text-amber-300 flex items-center gap-1"
                              >
                                <Reply className="w-3 h-3" /> 스레드 답글
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEditingMessageName(targetMsgName);
                                setEditingText(msg.text);
                              }}
                              className="hover:text-cyan-300 flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" /> 수정
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(targetMsgName)}
                              className="hover:text-rose-400 flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> 삭제
                            </button>
                            <button
                              onClick={() =>
                                onTriggerChatPrompt?.(
                                  `다음 Google Chat 메시지에서 일정이나 할 일을 추출해서 To-Do 목록에 등록할지 확인해 줘: "${msg.text}"`
                                )
                              }
                              className="hover:text-amber-300 flex items-center gap-1"
                            >
                              <CalendarPlus className="w-3 h-3" /> 일정 추출
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Tab 2: Space Members */}
          {rightTab === "members" && (
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">
                  선택된 스페이스:{" "}
                  <strong className="text-amber-300">{selectedSpaceId || "없음"}</strong>
                </p>
                {selectedSpaceId && (
                  <button
                    onClick={() => fetchSpaceMembers(selectedSpaceId)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> 멤버 새로고침
                  </button>
                )}
              </div>

              {loadingMembers ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                </div>
              ) : members.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1.5">
                  <Users className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                  <p>조회된 스페이스 참여 멤버가 없습니다.</p>
                  <p className="text-[11px] text-slate-500">
                    Google Chat REST API (`chat.memberships`) 권한이 있는 OAuth 2.0 또는 서비스 계정 연동 시 실시간 멤버 목록이 표시됩니다.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {members.map((m) => (
                    <div
                      key={m.name}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-200">{m.displayName}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{m.name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                          {m.role.replace("ROLE_", "")}
                        </span>
                        <span className="text-[10px] text-slate-400">{m.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Interactive @Junior Bot Webhook */}
          {rightTab === "bot_webhook" && (
            <div className="flex-1 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <h5 className="font-bold text-slate-100 flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-purple-400" />
                  양방향 Google Chat App 웹훅 엔드포인트
                </h5>
                <p className="text-slate-400 leading-relaxed">
                  Google Cloud Console의 <strong>Google Chat API → 구성(Configuration) → 연결 설정(Connection settings) → HTTP 엔드포인트 URL</strong>에 아래 주소를 등록하면, Google Chat 채팅방에서 <code>@Junior</code>에게 말을 걸었을 때 Junior가 실시간으로 도구(할 일/메일/웹 검색)를 실행하고 답장을 보냅니다.
                </p>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-purple-300">
                  <span>http://localhost:3000/api/google-chat/webhook</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        "http://localhost:3000/api/google-chat/webhook"
                      );
                      setStatusMessage({
                        type: "success",
                        text: "양방향 웹훅 엔드포인트 URL이 클립보드에 복사되었습니다.",
                      });
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> 복사
                  </button>
                </div>
              </div>

              {/* Interactive Bot Simulator */}
              <form
                onSubmit={handleSimulateBotWebhook}
                className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3"
              >
                <h5 className="font-bold text-slate-200 flex items-center gap-1.5">
                  <SmilePlus className="w-4 h-4 text-amber-400" />
                  양방향 @Junior 봇 이벤트 실시간 시뮬레이션
                </h5>
                <p className="text-[11px] text-slate-400">
                  Google Chat에서 <code>@Junior</code>를 멘션했을 때 웹훅이 어떻게 AI 응답을 생성하고 로그에 기록하는지 즉시 테스트해 보세요.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={botSimInput}
                    onChange={(e) => setBotSimInput(e.target.value)}
                    placeholder="예: 오늘 내 미완료 할 일 목록 알려줘"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    disabled={botSimLoading}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-1.5 shrink-0"
                  >
                    {botSimLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                    @Junior 호출 테스트
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Modal 1: Unified OAuth 2.0 / Service Account / Bearer Token Configuration */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                Google Chat 전체 연동 인증 설정 (OAuth 2.0 / 서비스 계정 / 토큰)
              </h4>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            {/* Auth Method Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAuthTab("oauth2")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "oauth2"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. OAuth 2.0 전체 연동
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("service_account")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "service_account"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. 서비스 계정 (JSON)
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("token")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "token"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Bearer 토큰 직접 입력
              </button>
            </div>

            {authTab === "oauth2" && (
              <form onSubmit={handleStartOAuth} className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 space-y-1 text-[11px]">
                  <p className="text-slate-200 font-semibold">
                    🔐 Google OAuth 2.0 전체 권한 연동 (Refresh Token 자동 갱신 지원)
                  </p>
                  <p>
                    승인된 리디렉션 URI에{" "}
                    <code className="text-amber-300">
                      {authStatus.redirectUri ||
                        "http://localhost:3000/api/auth/google-chat/callback"}
                    </code>{" "}
                    를 등록한 뒤 Client ID와 Secret을 입력하세요.
                  </p>
                  <p className="text-slate-500">
                    요청 스코프: <code>chat.spaces</code>, <code>chat.messages</code>,{" "}
                    <code>chat.memberships</code>, <code>chat.messages.reactions</code>
                  </p>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Google OAuth Client ID</label>
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Google OAuth Client Secret</label>
                  <input
                    type="password"
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    placeholder="GOCSPX-..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  {authStatus.hasAccessToken ? (
                    <button
                      type="button"
                      onClick={handleDisconnectAuth}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20"
                    >
                      기존 인증 연결 해제
                    </button>
                  ) : (
                    <div />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500"
                    >
                      Google 계정으로 Google Chat 연동하기
                    </button>
                  </div>
                </div>
              </form>
            )}

            {authTab === "service_account" && (
              <form onSubmit={handleSaveServiceAccount} className="space-y-3 text-xs">
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Google Cloud 서비스 계정(Service Account)의 JSON 키 전문을 붙여넣으시면, Junior가 내장 RS256 서명 엔진으로 토큰을 자동 발급·갱신하여 Google Chat Bot API를 호출합니다.
                </p>
                <textarea
                  rows={6}
                  required
                  value={serviceAccountInput}
                  onChange={(e) => setServiceAccountInput(e.target.value)}
                  placeholder='{"type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----\n...", "client_email": "..."}'
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500"
                  >
                    서비스 계정 저장 및 동기화
                  </button>
                </div>
              </form>
            )}

            {authTab === "token" && (
              <form onSubmit={handleSaveToken} className="space-y-3 text-xs">
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Google OAuth 2.0 Playground 등에서 발급받은 Bearer Access Token(<code>ya29...</code>)을 직접 입력하여 즉시 스페이스와 메시지를 동기화합니다.
                </p>
                <input
                  type="password"
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  placeholder="ya29.a0AfH6SM..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500"
                  >
                    토큰 저장 및 동기화
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal 2: Create New Google Chat Space via REST API (`spaces:setup`) */}
      {showCreateSpaceModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-amber-400" />
                새 Google Chat 스페이스 생성 (REST API `spaces:setup`)
              </h4>
              <button
                onClick={() => setShowCreateSpaceModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleCreateSpaceApi} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">새 스페이스 이름 *</label>
                <input
                  type="text"
                  required
                  value={newSpaceDisplayName}
                  onChange={(e) => setNewSpaceDisplayName(e.target.value)}
                  placeholder="예: AI 프로젝트 TF방"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">스페이스 설명 (선택)</label>
                <input
                  type="text"
                  value={newSpaceDesc}
                  onChange={(e) => setNewSpaceDesc(e.target.value)}
                  placeholder="예: Junior AI 에이전트와 함께하는 프로젝트 채널"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  초대할 멤버 이메일 (쉼표로 구분, 선택)
                </label>
                <input
                  type="text"
                  value={newSpaceMembers}
                  onChange={(e) => setNewSpaceMembers(e.target.value)}
                  placeholder="예: colleague1@company.com, colleague2@company.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateSpaceModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500"
                >
                  Google Chat에 스페이스 생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Add Space (Webhook / Manual Space ID) */}
      {showAddSpaceModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Webhook className="w-4 h-4 text-emerald-400" />
                Google Chat 스페이스 (웹훅 / Space ID) 등록
              </h4>
              <button
                onClick={() => setShowAddSpaceModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleAddSpace} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  스페이스 별칭 (채팅방 이름) *
                </label>
                <input
                  type="text"
                  required
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  placeholder="예: 개발팀 채널, 프로젝트 공지방, 나만의 알림방"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Google Chat Incoming Webhook URL (권장 · 10초 연동)
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  또는 Google Chat Space ID (REST API 사용 시 선택)
                </label>
                <input
                  type="text"
                  value={spaceIdInput}
                  onChange={(e) => setSpaceIdInput(e.target.value)}
                  placeholder="예: spaces/AAAA1234567"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">설명 / 메모 (선택)</label>
                <input
                  type="text"
                  value={spaceDesc}
                  onChange={(e) => setSpaceDesc(e.target.value)}
                  placeholder="예: 매일 오전 할 일 브리핑 및 회의록 공유용"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSpaceModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500"
                >
                  스페이스 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
