"use client";

import React, { useState, useEffect } from "react";
import { X, Key, Cpu, User, ExternalLink, Check, Save } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gemini-3.8-flash");
  const [userName, setUserName] = useState("사용자");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [hasEnvKey, setHasEnvKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setModel(data.settings?.model || "gemini-3.8-flash");
        setUserName(data.settings?.userName || "사용자");
        setGoogleClientId(data.settings?.googleClientId || "");
        setGoogleClientSecret(data.settings?.googleClientSecret || "");
        setHasEnvKey(data.hasEnvKey);
        setMaskedKey(data.settings?.apiKey || "");
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          model,
          userName: userName.trim(),
          googleClientId: googleClientId.trim() || undefined,
          googleClientSecret: googleClientSecret.trim() || undefined,
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => {
          setSavedSuccess(false);
          onSaved?.();
          onClose();
        }, 1200);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-junior-500/10 text-junior-400 rounded-lg">
              <Cpu className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-100">Junior 환경 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-4">
          {/* API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-junior-400" /> Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-junior-400 hover:underline flex items-center gap-1"
              >
                무료 키 발급 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={maskedKey ? `현재 등록됨 (${maskedKey})` : "AIzaSy..."}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-junior-500 font-mono"
            />
            {hasEnvKey && !maskedKey && (
              <p className="text-[11px] text-emerald-400">
                ✓ .env 파일에 환경 변수 키가 기본 설정되어 있습니다.
              </p>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-junior-400" /> AI 모델 엔진
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-junior-500"
            >
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (권장 - 최신 속도 & 지능 최적화)</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash (고속 모델)</option>
            </select>
          </div>

          {/* Google OAuth Credentials */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                Google OAuth 2.0 (Gmail 연동)
              </label>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-junior-400 hover:underline flex items-center gap-1"
              >
                콘솔 이동 <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400">Google Client ID</label>
              <input
                type="text"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400">Google Client Secret</label>
              <input
                type="password"
                value={googleClientSecret}
                onChange={(e) => setGoogleClientSecret(e.target.value)}
                placeholder="GOCSPX-xxxx"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>
          </div>

          {/* User Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-junior-400" /> 사용자 호칭 (이름)
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="이름을 입력하세요 (예: 홍길동)"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-junior-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-junior-600 hover:bg-junior-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-junior-600/20"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" /> 저장 완료!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> 설정 저장
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
