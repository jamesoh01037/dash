"use client";

import React, { useState } from "react";
import {
  Globe,
  CheckSquare,
  Brain,
  Mail,
  Users,
  MessageCircle,
  HardDrive,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { ToolCallRecord } from "@/lib/db";

interface ToolCallCardProps {
  tool: ToolCallRecord;
  status?: "running" | "completed";
}

export default function ToolCallCard({ tool, status = "completed" }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getToolMeta = () => {
    switch (tool.name) {
      case "search_web":
        return {
          icon: Globe,
          color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
          title: `웹 검색: "${tool.args.query || ""}"`,
          subtext: "실시간 정보 검색 도구",
        };
      case "manage_todos":
        return {
          icon: CheckSquare,
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
          title: `할 일 관리: ${getActionLabel(String(tool.args.action || ""))} ${tool.args.title ? `"${tool.args.title}"` : ""}`,
          subtext: "일정 및 To-Do 엔진",
        };
      case "manage_memory":
        return {
          icon: Brain,
          color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
          title: `메모리 업데이트: ${tool.args.content ? `"${tool.args.content}"` : "장기 기억 확인"}`,
          subtext: "개인화 장기 기억 지식 저장소",
        };
      case "manage_gmail":
        return {
          icon: Mail,
          color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
          title: `Gmail: ${getGmailActionLabel(String(tool.args.action || ""))} ${tool.args.query ? `("${tool.args.query}")` : ""}`,
          subtext: "Google 메일 & 일정 추출 엔진",
        };
      case "manage_contacts":
        return {
          icon: Users,
          color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
          title: `주소록: ${getContactsActionLabel(String(tool.args.action || ""))} ${tool.args.query || tool.args.name ? `("${tool.args.query || tool.args.name}")` : ""}`,
          subtext: "Google 주소록 & 연락처 매니저",
        };
      case "manage_google_chat":
        return {
          icon: MessageCircle,
          color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          title: `Google Chat: ${getGoogleChatActionLabel(String(tool.args.action || ""))} ${tool.args.spaceNameOrId ? `(${tool.args.spaceNameOrId})` : ""}`,
          subtext: "Google Chat API & 스페이스 허브",
        };
      case "manage_google_drive":
        return {
          icon: HardDrive,
          color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
          title: `Google Drive: ${getGoogleDriveActionLabel(String(tool.args.action || ""))} ${tool.args.name || tool.args.fileIdOrName || tool.args.query ? `("${tool.args.name || tool.args.fileIdOrName || tool.args.query}")` : ""}`,
          subtext: "Google Drive API v3 & 문서 엔진",
        };
      default:
        return {
          icon: Brain,
          color: "text-gray-400 bg-gray-500/10 border-gray-500/20",
          title: `도구 호출: ${tool.name}`,
          subtext: "내부 에이전트 도구",
        };
    }
  };

  const meta = getToolMeta();
  const Icon = meta.icon;

  return (
    <div className={`my-2 text-xs rounded-lg border p-2.5 transition-all ${meta.color}`}>
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {status === "running" ? (
            <Loader2 className="w-4 h-4 animate-spin text-junior-400" />
          ) : (
            <Icon className="w-4 h-4 shrink-0" />
          )}
          <span className="font-medium text-slate-200">{meta.title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200">
          <span className="text-[10px] hidden sm:inline">{meta.subtext}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 pt-2 border-t border-slate-700/50 text-slate-300 space-y-1.5">
          {tool.name === "search_web" && renderSearchResults(tool.result)}
          {tool.name === "manage_todos" && renderTodoResults(tool.result)}
          {tool.name === "manage_memory" && renderMemoryResults(tool.result)}
          {tool.name === "manage_gmail" && renderGmailResults(tool.result)}
          {tool.name === "manage_contacts" && renderContactsResults(tool.result)}
          {tool.name === "manage_google_chat" && renderGoogleChatResults(tool.result)}
          {tool.name === "manage_google_drive" && renderGoogleDriveResults(tool.result)}
          {tool.name !== "search_web" &&
            tool.name !== "manage_todos" &&
            tool.name !== "manage_memory" &&
            tool.name !== "manage_gmail" &&
            tool.name !== "manage_contacts" &&
            tool.name !== "manage_google_chat" &&
            tool.name !== "manage_google_drive" && (
              <pre className="p-2 bg-slate-900/60 rounded text-[11px] overflow-x-auto text-slate-300">
                {JSON.stringify(tool.result || tool.args, null, 2)}
              </pre>
            )}
        </div>
      )}
    </div>
  );
}

function getActionLabel(action: string) {
  switch (action) {
    case "add":
      return "추가";
    case "complete":
      return "완료";
    case "delete":
      return "삭제";
    case "list":
      return "목록 조회";
    default:
      return action;
  }
}

interface SearchResultItem {
  title: string;
  snippet: string;
  link: string;
}

function renderSearchResults(result: unknown) {
  const data = result as { query?: string; results?: SearchResultItem[] } | undefined;
  if (!data?.results || data.results.length === 0) {
    return <p className="text-slate-400">검색 결과가 없습니다.</p>;
  }

  return (
    <div className="space-y-1.5">
      {data.results.map((res, i) => (
        <div key={i} className="p-2 bg-slate-900/40 rounded border border-slate-800">
          <a
            href={res.link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-400 hover:underline flex items-center gap-1"
          >
            {res.title}
            <ExternalLink className="w-3 h-3 inline" />
          </a>
          <p className="text-slate-300 text-[11px] mt-0.5 line-clamp-2">{res.snippet}</p>
        </div>
      ))}
    </div>
  );
}

function renderTodoResults(result: unknown) {
  const data = result as { success?: boolean; message?: string; todo?: { title: string } } | undefined;
  return (
    <div className="text-slate-300">
      <p>{data?.message || JSON.stringify(result)}</p>
    </div>
  );
}

function renderMemoryResults(result: unknown) {
  const data = result as { success?: boolean; message?: string } | undefined;
  return (
    <div className="text-slate-300">
      <p>{data?.message || JSON.stringify(result)}</p>
    </div>
  );
}

function getGmailActionLabel(action: string) {
  switch (action) {
    case "list":
      return "메일 목록 조회";
    case "read":
      return "메일 본문 읽기";
    case "draft":
      return "초안 작성";
    case "send":
      return "메일 발송";
    case "detect_schedule":
      return "회의/일정 추출";
    default:
      return action;
  }
}

function GmailMessagesResultList({
  messages,
}: {
  messages: Array<{ id?: string; from: string; subject: string; snippet: string; date?: string }>;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-1">
      <p className="text-slate-400">
        메일 {messages.length}건 확인 (제목을 클릭하면 상세 내용을 표시합니다):
      </p>
      {messages.map((m, i) => {
        const isSelected = selectedIdx === i;
        return (
          <div
            key={i}
            className={`rounded border transition-all overflow-hidden ${
              isSelected
                ? "bg-slate-900/80 border-rose-500/40"
                : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedIdx(isSelected ? null : i)}
              className="w-full p-2 flex items-center justify-between gap-2 text-left select-none"
            >
              <span className="font-medium text-rose-300 truncate">{m.subject}</span>
              <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                {isSelected ? "닫기" : "내용 보기"}
                {isSelected ? (
                  <ChevronUp className="w-3 h-3 text-rose-400" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </span>
            </button>
            {isSelected && (
              <div className="px-2.5 py-2 border-t border-slate-800/80 bg-slate-950/70 space-y-1 text-[11px]">
                <p className="text-slate-400">
                  <span className="text-slate-500">보낸사람:</span> {m.from}
                </p>
                {m.date && (
                  <p className="text-slate-400">
                    <span className="text-slate-500">수신일시:</span> {m.date}
                  </p>
                )}
                {m.snippet && (
                  <p className="text-slate-200 leading-relaxed pt-1 whitespace-pre-wrap">
                    {m.snippet}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderGmailResults(result: unknown) {
  const data = result as {
    success?: boolean;
    error?: string;
    message?: string;
    messages?: Array<{ id?: string; from: string; subject: string; snippet: string; date?: string }>;
  } | undefined;

  if (data?.error) {
    return <p className="text-rose-400">{data.error}</p>;
  }

  if (data?.messages) {
    return <GmailMessagesResultList messages={data.messages} />;
  }

  return (
    <div className="text-slate-300">
      <p>{data?.message || JSON.stringify(result)}</p>
    </div>
  );
}

function getContactsActionLabel(action: string) {
  switch (action) {
    case "search":
      return "연락처 & 디렉터리 실시간 검색";
    case "list":
      return "주소록 조회";
    case "add":
      return "연락처 추가 (양방향 동기화)";
    case "update":
      return "연락처 수정 (양방향 동기화)";
    case "delete":
      return "연락처 삭제";
    case "sync_google_people":
      return "Google People API 전체 동기화";
    case "sync_gmail":
      return "Gmail 교류 연락처 자동 동기화";
    case "list_groups":
      return "주소록 라벨/그룹 조회";
    case "create_group":
      return "새 라벨/그룹 생성";
    case "toggle_favorite":
      return "즐겨찾기(별표) 설정";
    default:
      return action;
  }
}

function renderContactsResults(result: unknown) {
  const data = result as {
    success?: boolean;
    error?: string;
    message?: string;
    contacts?: Array<{ name: string; email: string; company?: string; phone?: string }>;
  } | undefined;

  if (data?.error) {
    return <p className="text-rose-400">{data.error}</p>;
  }

  if (data?.contacts) {
    return (
      <div className="space-y-1">
        <p className="text-slate-400">연락처 {data.contacts.length}건 확인:</p>
        {data.contacts.slice(0, 6).map((c, i) => (
          <div key={i} className="p-1.5 bg-slate-900/40 rounded border border-slate-800 flex items-center justify-between">
            <span className="font-medium text-cyan-300 truncate">{c.name}</span>
            <span className="text-slate-400 text-[10px] truncate">{c.email}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="text-slate-300">
      <p>{data?.message || JSON.stringify(result)}</p>
    </div>
  );
}

function getGoogleChatActionLabel(action: string) {
  switch (action) {
    case "list_spaces":
      return "스페이스 목록 동기화·조회";
    case "create_space":
      return "새 스페이스 생성";
    case "list_members":
      return "참여 멤버 조회";
    case "send_message":
      return "메시지/브리핑 전송";
    case "get_messages":
      return "최근 채팅 메시지 조회";
    case "update_message":
      return "메시지 수정";
    case "delete_message":
      return "메시지 삭제";
    case "add_reaction":
      return "이모지 리액션 추가";
    case "add_space":
      return "스페이스 등록";
    case "delete_space":
      return "스페이스 삭제";
    default:
      return action;
  }
}

function renderGoogleChatResults(result: unknown) {
  const data = result as {
    success?: boolean;
    error?: string;
    message?: string;
    spaces?: Array<{ name: string; spaceId?: string; spaceType?: string }>;
    members?: Array<{ displayName: string; role: string; type: string }>;
    messages?: Array<{ spaceName: string; sender: string; text: string }>;
  } | undefined;

  if (data?.error) {
    return <p className="text-rose-400">{data.error}</p>;
  }

  if (data?.members && data.members.length > 0) {
    return (
      <div className="space-y-1">
        <p className="text-slate-400">참여 멤버 {data.members.length}명:</p>
        {data.members.slice(0, 8).map((m, i) => (
          <div key={i} className="p-1.5 bg-slate-900/40 rounded border border-slate-800 flex items-center justify-between">
            <span className="font-medium text-amber-300 truncate">{m.displayName}</span>
            <span className="text-slate-400 text-[10px]">{m.role} ({m.type})</span>
          </div>
        ))}
      </div>
    );
  }

  if (data?.spaces && data.spaces.length > 0) {
    return (
      <div className="space-y-1">
        <p className="text-slate-400">스페이스 {data.spaces.length}개 연결됨:</p>
        {data.spaces.map((s, i) => (
          <div key={i} className="p-1.5 bg-slate-900/40 rounded border border-slate-800 flex items-center justify-between">
            <span className="font-medium text-amber-300 truncate">{s.name}</span>
            {s.spaceId && <span className="text-slate-400 text-[10px] font-mono">{s.spaceId}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (data?.messages && data.messages.length > 0) {
    return (
      <div className="space-y-1">
        <p className="text-slate-400">채팅 메시지 {data.messages.length}건 확인:</p>
        {data.messages.slice(0, 5).map((m, i) => (
          <div key={i} className="p-1.5 bg-slate-900/40 rounded border border-slate-800">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span className="text-amber-300 font-medium">{m.sender}</span>
              <span>{m.spaceName}</span>
            </div>
            <p className="text-slate-200 text-[11px] mt-0.5 truncate">{m.text}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="text-slate-300">
      <p>{data?.message || JSON.stringify(result)}</p>
    </div>
  );
}

function getGoogleDriveActionLabel(action: string) {
  switch (action) {
    case "list_files":
      return "파일/폴더 목록 조회";
    case "search_files":
      return "파일/문서 키워드 검색";
    case "read_file":
      return "문서 본문 읽기";
    case "create_doc":
      return "새 문서/시트 생성";
    case "create_folder":
      return "새 폴더 생성";
    case "update_file":
      return "파일 정보/본문 수정";
    case "share_file":
      return "권한/공유 링크 생성";
    case "delete_file":
      return "파일 삭제";
    case "sync_drive":
      return "클라우드 드라이브 동기화";
    case "get_quota":
      return "저장공간 용량 조회";
    default:
      return action;
  }
}

function renderGoogleDriveResults(result: unknown) {
  const data = result as {
    success?: boolean;
    error?: string;
    message?: string;
    file?: { name: string; webViewLink?: string; mimeType?: string };
    files?: Array<{ name: string; webViewLink?: string; mimeType?: string }>;
  } | undefined;

  if (data?.error) {
    return <p className="text-rose-400">{data.error}</p>;
  }

  if (data?.files && data.files.length > 0) {
    return (
      <div className="space-y-1">
        <p className="text-slate-400">드라이브 항목 {data.files.length}개 확인:</p>
        {data.files.slice(0, 6).map((f, i) => (
          <div key={i} className="p-1.5 bg-slate-900/40 rounded border border-slate-800 flex items-center justify-between gap-2">
            <span className="font-medium text-indigo-300 truncate">{f.name}</span>
            {f.webViewLink && (
              <a
                href={f.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-indigo-400 hover:underline flex items-center gap-0.5 shrink-0"
              >
                열기 <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (data?.file) {
    return (
      <div className="p-2 bg-slate-900/40 rounded border border-slate-800 space-y-1">
        <p className="text-slate-300">{data.message}</p>
        {data.file.webViewLink && (
          <a
            href={data.file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline inline-flex items-center gap-1 text-[11px]"
          >
            {data.file.name} 열기 <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="text-slate-300">
      <p>{data?.message || JSON.stringify(result)}</p>
    </div>
  );
}
