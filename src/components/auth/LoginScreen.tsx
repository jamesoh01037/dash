"use client";

import React, { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface LoginScreenProps {
  hasOAuthConfig?: boolean;
  oauthClientIdPrefix?: string | null;
  initialError?: string | null;
  onOAuthConfigured?: () => void;
}

export default function LoginScreen({
  initialError,
}: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login");
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Google 로그인 URL을 생성하지 못했습니다.");
        setIsLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("서버와 통신하는 중 오류가 발생했습니다.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#F8FAFD] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-[#DDE3EA] rounded-3xl shadow-lg p-6 sm:p-8 space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-sm border border-[#DDE3EA] bg-white flex items-center justify-center">
            <img
              src="/dash-logo.jpg"
              alt="lloomm AI Workspace Logo"
              className="w-full h-full object-cover scale-110"
            />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-[#1F1F1F] tracking-tight">
              lloomm
            </h1>
            <p className="text-xs sm:text-sm text-[#5F6368]">
              AI Workspace
            </p>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-2xl bg-[#FCE8E6] border border-[#FAD2CF] text-[#C5221F] text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Google Sign-in Only */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-full bg-white hover:bg-[#F8FAFD] active:bg-[#EDF2FA] border border-[#DDE3EA] shadow-sm hover:shadow transition-all flex items-center justify-center gap-3 text-sm font-semibold text-[#1F1F1F] disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#1A73E8]" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
            )}
            <span>Google 계정으로 로그인</span>
          </button>
        </div>
      </div>
    </div>
  );
}
