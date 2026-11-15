"use client";

import React, { useState, useEffect } from "react";
import {
  Mail,
  RefreshCw,
  ExternalLink,
  Search,
  Calendar,
  Sparkles,
  Send,
  AlertCircle,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  LogOut,
  Key,
} from "lucide-react";
import { EmailSummary } from "@/lib/gmail";

interface GmailDashboardProps {
  onTriggerChatPrompt?: (prompt: string) => void;
  onRefreshTrigger?: () => void;
}

export default function GmailDashboard({
  onTriggerChatPrompt,
  onRefreshTrigger,
}: GmailDashboardProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [emailAddress, setEmailAddress] = useState<string | undefined>();
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("is:unread");
  const [selectedEmail, setSelectedEmail] = useState<{
    id: string;
    subject: string;
    from: string;
    date: string;
    body: string;
  } | null>(null);

  // App Password Form State
  const [inputEmail, setInputEmail] = useState("");
  const [inputAppPassword, setInputAppPassword] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch("/api/auth/google");
      if (res.ok) {
        const data = await res.json();
        setIsConnected(data.isConnected);
        setEmailAddress(data.email);

        if (data.isConnected) {
          fetchEmails("is:unread");
        }
      }
    } catch (err) {
      console.error("Failed to check Google auth:", err);
    }
  };

  const fetchEmails = async (query = searchQuery) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/gmail?q=${encodeURIComponent(query)}&max=10`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError(null);
    if (!inputEmail.trim() || !inputAppPassword.trim()) {
      setConnectError("Gmail 주소와 16자리 앱 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setIsConnecting(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inputEmail.trim(),
          appPassword: inputAppPassword.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setConnectError(data.error || "Gmail 연결에 실패했습니다. 비밀번호를 다시 확인해 주세요.");
        return;
      }

      setInputEmail("");
      setInputAppPassword("");
      await checkAuthStatus();
      onRefreshTrigger?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectError(`연결 오류: ${msg}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Gmail 연동을 해제하시겠습니까?")) return;
    try {
      const res = await fetch("/api/auth/google", { method: "DELETE" });
      if (res.ok) {
        setIsConnected(false);
        setEmailAddress(undefined);
        setEmails([]);
        checkAuthStatus();
        onRefreshTrigger?.();
      }
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  const handleReadEmail = async (id: string) => {
    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/gmail?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEmail(data.email);
      }
    } catch (err) {
      console.error("Failed to load email details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAiAction = (action: "briefing" | "schedule" | "reply") => {
    if (!onTriggerChatPrompt) return;

    if (action === "briefing") {
      onTriggerChatPrompt("오늘 받은 중요 메일들을 확인하고 핵심 내용을 요약해서 브리핑해줘.");
    } else if (action === "schedule") {
      onTriggerChatPrompt("최근 메일들 중에서 회의나 약속, 미팅 일정이 잡힌 메일이 있는지 확인해서, 나에게 일정을 등록할지 물어봐줘.");
    } else if (action === "reply" && selectedEmail) {
      onTriggerChatPrompt(
        `'${selectedEmail.subject}' (보낸이: ${selectedEmail.from}) 메일을 읽고 정중하고 깔끔한 비즈니스 답장 초안(Draft)을 작성해줘.`
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-rose-950/30 via-slate-900 to-slate-900/80 border border-rose-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">Gmail 인텔리전스 허브</h2>
              {isConnected ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 연동됨
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> 연동 대기 중
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isConnected && emailAddress
                ? `${emailAddress} 계정으로 Junior와 실시간 연동 중입니다`
                : "16자리 앱 비밀번호로 복잡한 콘솔 설정 없이 즉시 Gmail을 연결하세요"}
            </p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEmails()}
              className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl transition-all"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> 연동 해제
            </button>
          </div>
        )}
      </div>

      {/* When NOT connected: Simple App Password Form */}
      {!isConnected && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6">
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Key className="w-4 h-4 text-rose-400" /> Google 16자리 앱 비밀번호로 원클릭 연동
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Google Cloud Console 프로젝트나 리디렉션 URI 설정 없이, Google 계정에서 발급받은 16자리 앱 비밀번호로 즉시 안전하게 연결됩니다.
            </p>
          </div>

          {/* Step Guide Card */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-2.5">
            <p className="font-semibold text-slate-200">📌 앱 비밀번호 발급 가이드 (1분 소요):</p>
            <ol className="list-decimal list-inside space-y-2 text-slate-400">
              <li>
                Google 계정에 <b>2단계 인증</b>이 켜져 있는지 확인합니다.
              </li>
              <li>
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-junior-400 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  Google 계정 앱 비밀번호 생성 페이지 바로가기 <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
              <li>
                앱 이름에 <b>&quot;Junior&quot;</b>를 입력하고 <b>[만들기]</b>를 클릭합니다.
              </li>
              <li>
                화면에 노란색 박스로 나타나는 <b>16자리 비밀번호</b>(예: <code className="text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded">abcd efgh ijkl mnop</code>)를 복사하여 아래에 입력합니다. (띄어쓰기는 자동으로 정리됩니다)
              </li>
            </ol>
          </div>

          {/* Form */}
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-rose-400" /> 연동할 Gmail 주소
                </label>
                <input
                  type="email"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  placeholder="james@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500 font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" /> 16자리 앱 비밀번호 (App Password)
                </label>
                <input
                  type="password"
                  value={inputAppPassword}
                  onChange={(e) => setInputAppPassword(e.target.value)}
                  placeholder="abcd efgh ijkl mnop"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500 font-mono"
                  required
                />
              </div>
            </div>

            {connectError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{connectError}</span>
              </div>
            )}

            <div className="pt-2 text-center">
              <button
                type="submit"
                disabled={isConnecting || !inputEmail.trim() || !inputAppPassword.trim()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 disabled:opacity-40 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-500/25 transition-all transform hover:scale-[1.01] active:scale-[0.99]"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Gmail 연결 확인 중...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" /> Gmail 계정 연결하기 <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* When CONNECTED: Quick AI Actions & Email Explorer */}
      {isConnected && (
        <div className="space-y-6">
          {/* AI One-Click Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => handleAiAction("briefing")}
              className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-left transition-all group"
            >
              <div className="p-2 w-fit rounded-lg bg-rose-500/10 text-rose-400 mb-2 group-hover:scale-105 transition-transform">
                <Sparkles className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-200">오늘의 메일 AI 브리핑</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                중요 메일과 안 읽은 메일을 Junior가 한눈에 요약해 줍니다
              </p>
            </button>

            <button
              onClick={() => handleAiAction("schedule")}
              className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-left transition-all group"
            >
              <div className="p-2 w-fit rounded-lg bg-emerald-500/10 text-emerald-400 mb-2 group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-200">메일 속 일정/미팅 탐지</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                회의 요청을 감지해 확인 후 일정에 자동 등록합니다
              </p>
            </button>

            <button
              onClick={() =>
                onTriggerChatPrompt?.("Gmail에서 새 이메일 초안(Draft)을 작성하고 싶어. 수신자와 제목, 내용을 물어봐줘.")
              }
              className="p-4 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-left transition-all group"
            >
              <div className="p-2 w-fit rounded-lg bg-blue-500/10 text-blue-400 mb-2 group-hover:scale-105 transition-transform">
                <Send className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-200">대화형 메일 초안 작성</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                Junior와 대화하며 자연스러운 비즈니스 메일 초안을 작성합니다
              </p>
            </button>
          </div>

          {/* Search Bar & Quick Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchEmails(searchQuery)}
                placeholder="검색어 또는 쿼리 (예: is:unread)..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
              <button
                onClick={() => {
                  setSearchQuery("is:unread");
                  fetchEmails("is:unread");
                }}
                className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  searchQuery === "is:unread"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                읽지 않음
              </button>
              <button
                onClick={() => {
                  setSearchQuery("in:inbox");
                  fetchEmails("in:inbox");
                }}
                className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  searchQuery === "in:inbox"
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                받은 편지함 전체
              </button>
            </div>
          </div>

          {/* Email List */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Gmail 편지함을 불러오는 중입니다...
              </div>
            ) : emails.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                일치하는 메일이 없습니다.
              </div>
            ) : (
              emails.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 transition-all overflow-hidden"
                >
                  <div
                    onClick={() => handleReadEmail(msg.id)}
                    className="p-3.5 flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-1">
                        {msg.isUnread ? (
                          <span className="w-2 h-2 rounded-full bg-rose-500 block shadow-sm shadow-rose-500/50" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-700 block" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {msg.subject}
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {msg.from}
                        </p>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-1">
                          {msg.snippet}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-slate-500 text-[11px]">
                      <span>{msg.date}</span>
                      {selectedEmail?.id === msg.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Email Body & Action Toolbar */}
                  {selectedEmail?.id === msg.id && (
                    <div className="p-4 border-t border-slate-800/80 bg-slate-950/70 space-y-3">
                      <div className="prose prose-invert prose-sm max-w-none text-slate-300 text-xs whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                        {selectedEmail.body || msg.snippet}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          onClick={() =>
                            onTriggerChatPrompt?.(
                              `다음 메일의 핵심 요점을 3줄로 명확하게 요약해줘:\n\n[제목: ${selectedEmail.subject}]\n[송신자: ${selectedEmail.from}]\n${selectedEmail.body.slice(0, 1500)}`
                            )
                          }
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-junior-400" /> AI 3줄 요약
                        </button>

                        <button
                          onClick={() =>
                            onTriggerChatPrompt?.(
                              `다음 메일에서 회의나 미팅, 마감일 일정이 있는지 확인하고, 발견되면 나에게 일정을 등록할지 물어봐줘:\n\n[제목: ${selectedEmail.subject}]\n[송신자: ${selectedEmail.from}]\n${selectedEmail.body.slice(0, 1500)}`
                            )
                          }
                          className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <Calendar className="w-3.5 h-3.5" /> 일정/미팅 추출
                        </button>

                        <button
                          onClick={() => handleAiAction("reply")}
                          className="px-3 py-1.5 bg-junior-950/60 hover:bg-junior-900/60 text-junior-300 border border-junior-800/50 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" /> 답장 초안(Draft) 작성
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
