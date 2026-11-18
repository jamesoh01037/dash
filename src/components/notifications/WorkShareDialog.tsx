"use client";

import React, { useEffect, useState } from "react";
import { JuniorNotificationItem } from "@/lib/db";
import {
  Mail,
  MessageCircle,
  X,
  Send,
  Loader2,
  Search,
  Plus,
  Paperclip,
  ExternalLink,
  Users,
  Hash,
  CheckCircle2,
} from "lucide-react";

interface OrgContactOption {
  id: string;
  name: string;
  email: string;
  organization: string;
}

interface SharedAttachmentInfo {
  fileName: string;
  mimeType: string;
  summary: string;
  driveUrl?: string;
}

interface ChatSpaceOption {
  id: string;
  name: string;
  spaceId?: string;
  spaceType?: string;
}

interface WorkShareDialogProps {
  mode: "mail" | "chat";
  notification: JuniorNotificationItem;
  onClose: () => void;
  onSharedSuccess?: (message: string) => void;
}

export default function WorkShareDialog({
  mode,
  notification,
  onClose,
  onSharedSuccess,
}: WorkShareDialogProps) {
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [orgContacts, setOrgContacts] = useState<OrgContactOption[]>([]);
  const [attachments, setAttachments] = useState<SharedAttachmentInfo[]>([]);
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceOption[]>([]);

  // Mail state
  const [mailSubject, setMailSubject] = useState(
    `업무정보공유: ${notification.fileName}`
  );
  const [mailTo, setMailTo] = useState("");
  const [mailCc, setMailCc] = useState("");
  const [mailBody, setMailBody] = useState(notification.summary || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OrgContactOption[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);

  // Chat state
  const [chatTargetType, setChatTargetType] = useState<"space" | "person">(
    "space"
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [selectedPerson, setSelectedPerson] =
    useState<OrgContactOption | null>(null);
  const [chatFirstLine, setChatFirstLine] = useState(
    `${notification.fileName} 관련 정보 공유`
  );
  const [chatBody, setChatBody] = useState(notification.summary || "");

  const buildContentWithAttachments = (
    baseSummary: string,
    atts: SharedAttachmentInfo[]
  ) => {
    const lines = [baseSummary.trim()];
    if (atts.length > 0) {
      lines.push("");
      lines.push("📎 첨부 문서 요약 및 Google Drive 링크:");
      for (const att of atts) {
        lines.push(`• ${att.fileName}`);
        lines.push(`  요약: ${att.summary}`);
        if (att.driveUrl) {
          lines.push(`  Google Drive URL: ${att.driveUrl}`);
        }
      }
    }
    return lines.join("\n").trim();
  };

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      setIsPreparing(true);
      setErrorMsg(null);
      try {
        const res = await fetch(
          `/api/notifications/share?notificationId=${encodeURIComponent(notification.id)}`
        );
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setErrorMsg(data.error || "공유 정보를 불러오지 못했습니다.");
          return;
        }

        const loadedContacts: OrgContactOption[] = data.orgContacts || [];
        const loadedAttachments: SharedAttachmentInfo[] =
          data.attachments || [];
        const loadedSpaces: ChatSpaceOption[] = data.chatSpaces || [];

        setOrgContacts(loadedContacts);
        setSearchResults(loadedContacts);
        setAttachments(loadedAttachments);
        setChatSpaces(loadedSpaces);

        if (loadedSpaces.length > 0) {
          setChatTargetType("space");
          setSelectedSpaceId(loadedSpaces[0].spaceId || loadedSpaces[0].id);
          setSelectedPerson(null);
        } else {
          setChatTargetType("person");
          setSelectedSpaceId("");
          setSelectedPerson(null);
        }

        const autoTo: string[] = data.autoFill?.to || [];
        const autoCc: string[] = data.autoFill?.cc || [];
        if (autoTo.length > 0) setMailTo(autoTo.join(", "));
        if (autoCc.length > 0) setMailCc(autoCc.join(", "));

        const fullText = buildContentWithAttachments(
          notification.summary || "",
          loadedAttachments
        );
        setMailBody(fullText);
        setChatBody(fullText);
      } catch {
        if (!cancelled) {
          setErrorMsg("네트워크 오류로 공유 정보를 준비하지 못했습니다.");
        }
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    };

    prepare();
    return () => {
      cancelled = true;
    };
  }, [notification.id, notification.summary]);

  const handleSearchContacts = async (q: string) => {
    setSearchQuery(q);
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchResults(orgContacts);
      return;
    }
    setIsSearchingContacts(true);
    try {
      const res = await fetch(
        `/api/notifications/share?q=${encodeURIComponent(trimmed)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.contacts || []);
      }
    } finally {
      setIsSearchingContacts(false);
    }
  };

  const appendEmailToField = (
    currentValue: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    email: string
  ) => {
    const existing = currentValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (existing.some((e) => e.toLowerCase() === email.toLowerCase())) return;
    setter([...existing, email].join(", "));
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/notifications/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_mail",
          to: mailTo,
          cc: mailCc,
          subject: mailSubject,
          body: mailBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "메일 발송에 실패했습니다.");
        return;
      }
      onSharedSuccess?.(
        `✉️ '${mailTo}' 앞으로 "${mailSubject}" 업무 공유 메일을 발송했습니다.`
      );
      onClose();
    } catch {
      setErrorMsg("메일 발송 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setErrorMsg(null);
    try {
      const firstDriveUrl = attachments.find((a) => a.driveUrl)?.driveUrl;
      const res = await fetch("/api/notifications/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_chat",
          targetType: chatTargetType,
          spaceId: selectedSpaceId,
          personEmail: selectedPerson?.email,
          personName: selectedPerson?.name,
          title: chatFirstLine,
          text: chatBody,
          buttonUrl: firstDriveUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Google Chat 전송에 실패했습니다.");
        return;
      }
      const targetLabel =
        chatTargetType === "person"
          ? selectedPerson?.name || selectedPerson?.email || "상대방"
          : chatSpaces.find(
              (s) => (s.spaceId || s.id) === selectedSpaceId
            )?.name || "스페이스";
      onSharedSuccess?.(
        `💬 Google Chat '${targetLabel}'에 업무 정보를 공유했습니다.`
      );
      onClose();
    } catch {
      setErrorMsg("Google Chat 전송 중 네트워크 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {mode === "mail" ? (
              <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300">
                <Mail className="w-4 h-4" />
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
                <MessageCircle className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                {mode === "mail" ? "Mail로 업무공유" : "Chat으로 업무공유"}
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-md">
                원본: {notification.fileName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {isPreparing && (
            <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700 text-xs text-slate-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
              <span>
                조직 메일 검색 및 첨부파일 Google Drive 공유 링크를 준비하고 있습니다...
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
                <Paperclip className="w-3.5 h-3.5" />
                Google Drive에 저장된 첨부파일 ({attachments.length}건)
              </div>
              <div className="space-y-1">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 text-[11px] text-slate-300 bg-slate-950/60 px-2.5 py-1.5 rounded-lg"
                  >
                    <span className="truncate">{att.fileName}</span>
                    {att.driveUrl ? (
                      <a
                        href={att.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 hover:underline flex items-center gap-1 shrink-0"
                      >
                        Drive 링크 <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500 shrink-0">링크 없음</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === "mail" ? (
            <form id="work-share-mail-form" onSubmit={handleSendMail} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  제목
                </label>
                <input
                  type="text"
                  value={mailSubject}
                  onChange={(e) => setMailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    수신자 (To)
                  </label>
                  <input
                    type="text"
                    value={mailTo}
                    onChange={(e) => setMailTo(e.target.value)}
                    placeholder="user@company.com (쉼표로 여러 명)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    참조자 (Cc)
                  </label>
                  <input
                    type="text"
                    value={mailCc}
                    onChange={(e) => setMailCc(e.target.value)}
                    placeholder="cc@company.com (쉼표로 여러 명)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Org Email Search Helper */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchContacts(e.target.value)}
                    placeholder="조직 구성원 이름 또는 이메일 검색 후 수신/참조 추가..."
                    className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
                  />
                  {isSearchingContacts && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
                    {searchResults.slice(0, 12).map((c) => (
                      <div
                        key={c.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] text-slate-300"
                      >
                        <span className="font-medium text-slate-200">{c.name}</span>
                        <span className="text-slate-500">({c.email})</span>
                        <button
                          type="button"
                          onClick={() =>
                            appendEmailToField(mailTo, setMailTo, c.email)
                          }
                          className="ml-1 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-[10px] font-semibold"
                        >
                          +수신
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            appendEmailToField(mailCc, setMailCc, c.email)
                          }
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-[10px] font-semibold"
                        >
                          +참조
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  본문 (원본 메일 요약 + 첨부 문서 요약 및 Drive URL)
                </label>
                <textarea
                  rows={8}
                  value={mailBody}
                  onChange={(e) => setMailBody(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
            </form>
          ) : (
            <form id="work-share-chat-form" onSubmit={handleSendChat} className="space-y-3.5">
              {/* Target selector: Space vs Person (mutually exclusive) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChatTargetType("space");
                      setSelectedPerson(null);
                      if (!selectedSpaceId && chatSpaces.length > 0) {
                        setSelectedSpaceId(
                          chatSpaces[0].spaceId || chatSpaces[0].id
                        );
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
                      chatTargetType === "space"
                        ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                        : "bg-slate-950 text-slate-400 border-slate-800"
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    스페이스 선택 ({chatSpaces.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChatTargetType("person");
                      setSelectedSpaceId("");
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
                      chatTargetType === "person"
                        ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                        : "bg-slate-950 text-slate-400 border-slate-800"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    사람 선택 (1:1 DM)
                  </button>
                </div>

                {chatTargetType === "space" ? (
                  chatSpaces.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      등록된 스페이스가 없습니다. &ldquo;사람 선택&rdquo; 탭을 이용하거나 [Google Chat] 탭에서 스페이스를 연결해 주세요.
                    </p>
                  ) : (
                    <select
                      value={selectedSpaceId}
                      onChange={(e) => setSelectedSpaceId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {chatSpaces.map((sp) => (
                        <option key={sp.id} value={sp.spaceId || sp.id}>
                          {sp.name}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    {selectedPerson && (
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs">
                        <span className="text-amber-200 font-medium truncate">
                          선택됨: {selectedPerson.name} ({selectedPerson.email})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedPerson(null)}
                          className="px-2 py-0.5 rounded bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                        >
                          <X className="w-3 h-3" />
                          선택 취소
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearchContacts(e.target.value)}
                        placeholder="채팅을 보낼 사람 이름 또는 이메일 검색..."
                        className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {searchResults.slice(0, 15).map((c) => {
                        const isSelected = selectedPerson?.email === c.email;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setSelectedPerson(isSelected ? null : c)
                            }
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 ${
                              isSelected
                                ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
                                : "bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500"
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-3 h-3" />}
                            <span>{c.name}</span>
                            <span className="text-slate-500">({c.email})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Single Box Preview */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2.5">
                <div className="text-[11px] font-bold text-amber-300">
                  하나의 박스로 전송될 내용
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    첫 줄 (제목)
                  </label>
                  <input
                    type="text"
                    value={chatFirstLine}
                    onChange={(e) => setChatFirstLine(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    본문 (메일 요약 + 첨부 문서 요약 및 Drive URL)
                  </label>
                  <textarea
                    rows={7}
                    value={chatBody}
                    onChange={(e) => setChatBody(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 leading-relaxed focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-end gap-2 bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            취소
          </button>
          <button
            type="submit"
            form={mode === "mail" ? "work-share-mail-form" : "work-share-chat-form"}
            disabled={
              isSending ||
              isPreparing ||
              (mode === "chat" &&
                ((chatTargetType === "space" && !selectedSpaceId) ||
                  (chatTargetType === "person" && !selectedPerson)))
            }
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 ${
              mode === "mail"
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {mode === "mail" ? "메일 발송" : "Chat으로 공유"}
          </button>
        </div>
      </div>
    </div>
  );
}
