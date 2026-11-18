"use client";

import React from "react";
import { Menu, Settings, LogOut } from "lucide-react";
import { AppTab, PLACEHOLDER_TAB_META, PlaceholderTab } from "@/lib/navigation";

interface HeaderProps {
  currentTab: AppTab;
  onToggleSidebar?: () => void;
  onOpenSettings: () => void;
  onLogout?: () => void;
  model: string;
  userName: string;
  assistantName?: string;
}

export default function Header({
  currentTab,
  onToggleSidebar,
  onOpenSettings,
  onLogout,
  model,
  userName,
  assistantName = "Junior",
}: HeaderProps) {
  const getTabTitle = () => {
    switch (currentTab) {
      case "chat":
        return {
          title: "대화",
          sub: `${userName}님 전담 비서 ${assistantName}와 대화 및 작업을 진행 중입니다`,
        };
      case "todos":
        return {
          title: "확인사항",
          sub: `${assistantName}가 등록한 할 일 & 일정 목록 및 확인이 필요한 스마트 작업 목록`,
        };
      case "memory":
        return {
          title: "장기기억 설정",
          sub: `${assistantName}가 기억하고 지켜야 할 지침, 선호도 및 프로젝트 장기기억 설정`,
        };
      case "notifications":
        return {
          title: "알림",
          sub: "수신 메일·첨부 문서 요약, 내 할 일·캘린더 자동 등록 및 담당자별 업무 보고",
        };
      case "gmail":
        return {
          title: "Gmail 인텔리전스 허브",
          sub: "Google 메일 조회, AI 3줄 요약, 답장 초안 및 일정 감지",
        };
      case "contacts":
        return {
          title: "Google 주소록 (Contacts)",
          sub: "People API 양방향 동기화, 조직 디렉터리 및 Gmail 연락처 관리",
        };
      case "gchat":
        return {
          title: "Google Chat (구글 챗) 허브",
          sub: "Google Chat 스페이스 웹훅 & REST API 브리핑 발송 및 메시지 연동",
        };
      case "gdrive":
        return {
          title: "Google 드라이브 (Drive API v3)",
          sub: "Google 문서·시트·폴더 생성, 본문 AI 요약 및 권한 공유 허브",
        };
      default: {
        const meta = PLACEHOLDER_TAB_META[currentTab as PlaceholderTab];
        if (meta) {
          return {
            title: meta.title,
            sub: `${meta.category} · ${meta.subtitle}`,
          };
        }
        return { title: "Workspace", sub: "" };
      }
    }
  };

  const meta = getTabTitle();

  return (
    <header className="h-14 sm:h-16 bg-[#F8FAFD] px-3 sm:px-5 flex items-center justify-between shrink-0 select-none">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-2 text-[#444746] hover:text-[#1F1F1F] rounded-full hover:bg-[#EAEFF6] transition-colors shrink-0"
            title="메뉴 열기/닫기"
            aria-label="메뉴 열기/닫기"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#1F1F1F] truncate">
              {meta.title}
            </h2>
            {/* Google 4-color Dots */}
            <div className="hidden md:flex items-center gap-1 ml-1">
              <span className="w-2 h-2 rounded-full bg-[#4285F4]" />
              <span className="w-2 h-2 rounded-full bg-[#EA4335]" />
              <span className="w-2 h-2 rounded-full bg-[#FBBC05]" />
              <span className="w-2 h-2 rounded-full bg-[#34A853]" />
            </div>
          </div>

        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Google Style Status & Model Pill */}
        <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-white border border-[#DDE3EA] text-[11px] text-[#3C4043] shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-[#34A853] animate-pulse shrink-0" />
          <span className="font-medium text-[#1F1F1F] max-w-[110px] sm:max-w-none truncate">
            {model}
          </span>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-2 text-[#444746] hover:text-[#1F1F1F] hover:bg-[#EAEFF6] rounded-full transition-colors"
          title="설정"
        >
          <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white hover:bg-[#FCE8E6] border border-[#DDE3EA] hover:border-[#FAD2CF] text-[#444746] hover:text-[#C5221F] text-xs font-medium transition-colors"
            title="Google 계정 로그아웃"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        )}
      </div>
    </header>
  );
}
