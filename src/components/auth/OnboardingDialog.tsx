"use client";

import React, { useState } from "react";
import { Bot, Sparkles, User, Loader2 } from "lucide-react";

interface OnboardingDialogProps {
  defaultUserName?: string;
  defaultAssistantName?: string;
  userEmail?: string;
  onCompleted: (userName: string, assistantName: string) => void;
}

export default function OnboardingDialog({
  defaultUserName = "",
  defaultAssistantName = "Junior",
  userEmail,
  onCompleted,
}: OnboardingDialogProps) {
  const [userName, setUserName] = useState(defaultUserName);
  const [assistantName, setAssistantName] = useState(defaultAssistantName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = userName.trim();
    const cleanAssistant = assistantName.trim();
    if (!cleanUser || !cleanAssistant) {
      setError("당신의 이름과 AI 비서의 이름을 모두 입력해 주세요.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: cleanUser,
          assistantName: cleanAssistant,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "저장에 실패했습니다.");
      } else {
        onCompleted(cleanUser, cleanAssistant);
      }
    } catch {
      setError("서버와 통신하는 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-[#DDE3EA] rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-[#E8F0FE] border border-[#D3E3FD] flex items-center justify-center text-[#1A73E8]">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#1F1F1F]">
            당신의 이름과 AI 비서의 이름을 알려주세요
          </h2>
          <p className="text-xs text-[#5F6368] leading-relaxed">
            처음 접속하신 것을 환영합니다!
            {userEmail ? ` (${userEmail})` : ""}
            <br />
            입력하신 이름은 앞으로 서비스 전체의 호칭과 비서 이름에 적용됩니다.
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-[#FCE8E6] border border-[#FAD2CF] text-[#C5221F] text-xs font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#1F1F1F] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#1A73E8]" />
              당신의 이름
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="예: 홍길동, James"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-sm text-[#1F1F1F] placeholder-[#5F6368] focus:outline-none focus:border-[#1A73E8]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#1F1F1F] flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-[#1A73E8]" />
              AI 비서의 이름
            </label>
            <input
              type="text"
              value={assistantName}
              onChange={(e) => setAssistantName(e.target.value)}
              placeholder="예: Junior, 자비스, 비서"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-sm text-[#1F1F1F] placeholder-[#5F6368] focus:outline-none focus:border-[#1A73E8]"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving || !userName.trim() || !assistantName.trim()}
            className="w-full py-3 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>저장 중...</span>
              </>
            ) : (
              <span>시작하기</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
