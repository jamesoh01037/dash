"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FileCheck2,
  FileText,
  BarChart3,
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Eye,
  X,
  ArrowRight,
  Building2,
  Loader2,
  Trash2,
  Edit3,
  Plus,
  MessageSquare,
} from "lucide-react";
import { ApprovalDocumentRecord, ApprovalTemplate, ToolCallRecord } from "@/lib/db";
import { resolveApprovalSteps } from "@/lib/approvalRules";
import ToolCallCard from "@/components/chat/ToolCallCard";

interface ApprovalStats {
  totalCount: number;
  inProgressCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalAmount: number;
  approvedAmount: number;
  deliveredCount: number;
  byDocType: Array<{
    docTypeId: string;
    docTypeName: string;
    count: number;
    approvedCount: number;
    inProgressCount: number;
    rejectedCount: number;
    totalAmount: number;
  }>;
}

interface ApprovalFlowDashboardProps {
  userName?: string;
  viewMode?: "approval" | "received";
  onTriggerChatPrompt?: (prompt: string) => void;
}

export default function ApprovalFlowDashboard({
  userName = "James",
  viewMode = "approval",
  onTriggerChatPrompt,
}: ApprovalFlowDashboardProps) {
  const [subTab, setSubTab] = useState<"compose" | "inbox" | "policies" | "stats">("compose");
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([]);
  const [mcpSource, setMcpSource] = useState<string>("builtin_mcp_schema");
  const [documents, setDocuments] = useState<ApprovalDocumentRecord[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Compose state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [docTitle, setDocTitle] = useState("");
  const [requesterDept, setRequesterDept] = useState("사업개발팀");
  const [amountInput, setAmountInput] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Inbox state
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "approved" | "rejected">("all");
  const [actingDocId, setActingDocId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ApprovalTemplate | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Inline AI Chat state (shown at bottom of compose & stats tabs)
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      toolCalls?: ToolCallRecord[];
    }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallRecord[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 4000);
  };

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates);
        setSelectedTemplateId((prev) => prev || data.templates[0]?.id || "");
      }
      if (data.mcpSource) setMcpSource(data.mcpSource);
      if (Array.isArray(data.documents)) setDocuments(data.documents);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error("Failed to fetch approvals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleTemplateChange = (newId: string) => {
    setSelectedTemplateId(newId);
    setFormData({});
    setFormError(null);
    setDocTitle("");
    setAmountInput("");
  };

  const numericAmount = amountInput.trim()
    ? Number(amountInput.replace(/,/g, ""))
    : undefined;
  const resolvedLine = selectedTemplate
    ? resolveApprovalSteps(
        selectedTemplate,
        typeof numericAmount === "number" && !Number.isNaN(numericAmount)
          ? numericAmount
          : undefined
      )
    : null;

  const handleOpenPreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    if (!docTitle.trim()) {
      setFormError("결재 문서 제목을 입력해 주세요.");
      return;
    }
    for (const f of selectedTemplate.fields) {
      if (f.required && !(formData[f.key] || "").trim()) {
        setFormError(`필수 항목 '${f.label}'을(를) 입력해 주세요.`);
        return;
      }
    }
    setFormError(null);
    setShowPreview(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedTemplate || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          docTypeId: selectedTemplate.id,
          title: docTitle.trim(),
          requesterDept: requesterDept.trim() || "사업개발팀",
          amount: numericAmount,
          formData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "결재 상신에 실패했습니다.");
        setShowPreview(false);
        return;
      }
      setShowPreview(false);
      setDocTitle("");
      setAmountInput("");
      setFormData({});
      await fetchApprovals();
      setSubTab("inbox");
      showToast(`✅ '${data.document?.title}' (${data.document?.docNumber}) 결재가 상신되었습니다.`);
    } catch {
      setFormError("결재 상신 중 네트워크 오류가 발생했습니다.");
      setShowPreview(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepDecision = async (docId: string, action: "approve" | "reject") => {
    if (actingDocId) return;
    const comment =
      action === "reject"
        ? window.prompt("반려 사유를 입력해 주세요 (선택):") ?? undefined
        : undefined;
    setActingDocId(docId);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: docId, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data.error || "결재 처리에 실패했습니다."}`);
        return;
      }
      await fetchApprovals();
      const updated = data.document as ApprovalDocumentRecord | undefined;
      if (updated?.status === "approved") {
        showToast(
          `✅ 최종 승인 완료! 실행부서(${updated.executionDept} · ${updated.executionAssignee})로 전달되었습니다.`
        );
      } else if (updated?.status === "rejected") {
        showToast(`❌ 결재가 반려되었습니다.`);
      } else {
        showToast(`✅ 현재 단계가 승인되어 다음 결재자에게 전달되었습니다.`);
      }
    } finally {
      setActingDocId(null);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: docId }),
    });
    await fetchApprovals();
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate || savingTemplate) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_template",
          template: editingTemplate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${data.error || "규정 저장에 실패했습니다."}`);
        return;
      }
      await fetchApprovals();
      setEditingTemplate(null);
      showToast(`✅ '${editingTemplate.name}' MCP 결재 규정이 저장되었습니다.`);
    } catch {
      showToast("⚠️ 규정 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingTemplate(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, activeToolCalls]);

  const sendInlineChat = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? chatInput).trim();
    if (!prompt || chatLoading) return;

    if (!overridePrompt) setChatInput("");
    const userMsgId = `u-${Date.now()}`;
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: prompt },
    ]);
    setChatLoading(true);
    setActiveToolCalls([]);

    let accumulatedText = "";
    const collectedTools: ToolCallRecord[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "approval-flow-inline",
          message: prompt,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("대화 서버 응답에 실패했습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const evt of events) {
          if (!evt.trim()) continue;
          const lines = evt.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              dataStr = line.replace("data: ", "").trim();
            }
          }
          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (eventType === "tool_start") {
              const tc: ToolCallRecord = {
                id: parsed.id,
                name: parsed.name,
                args: parsed.args,
              };
              collectedTools.push(tc);
              setActiveToolCalls([...collectedTools]);
            } else if (eventType === "tool_end") {
              const idx = collectedTools.findIndex((t) => t.id === parsed.id);
              if (idx !== -1) {
                collectedTools[idx] = { ...collectedTools[idx], result: parsed.result };
                setActiveToolCalls([...collectedTools]);
              }
              await fetchApprovals();
            } else if (eventType === "text") {
              accumulatedText += parsed.chunk || "";
            }
          } catch {
            // ignore malformed JSON chunk
          }
        }
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: accumulatedText || "처리가 완료되었습니다.",
          toolCalls: collectedTools.length > 0 ? [...collectedTools] : undefined,
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            err instanceof Error
              ? `⚠️ ${err.message}`
              : "⚠️ 대화 처리 중 오류가 발생했습니다.",
        },
      ]);
    } finally {
      setChatLoading(false);
      setActiveToolCalls([]);
    }
  };

  const myDocuments = documents.filter(
    (d) =>
      (d.requesterName || "").trim().toLowerCase() ===
      userName.trim().toLowerCase()
  );

  const receivedDocuments = documents.filter((d) =>
    d.steps.some((s) =>
      s.approverName.toLowerCase().includes(userName.trim().toLowerCase())
    )
  );

  const filteredDocs = myDocuments.filter((d) =>
    statusFilter === "all" ? true : d.status === statusFilter
  );

  const filteredReceivedDocs = receivedDocuments.filter((d) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "in_progress") {
      return (
        d.status === "in_progress" &&
        d.steps.some(
          (s) =>
            s.order === d.currentStepOrder &&
            s.status === "pending" &&
            s.approverName.toLowerCase().includes(userName.trim().toLowerCase())
        )
      );
    }
    return d.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-xs gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        <span>MCP 결재 규정 및 결재함을 불러오는 중입니다...</span>
      </div>
    );
  }

  if (viewMode === "received") {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F8FAFD]">
        {toastMsg && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700">
            {toastMsg}
          </div>
        )}

        <div className="bg-white border border-[#DDE3EA] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-[#188038]">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1F1F1F]">
                내가 받은 결재 ({receivedDocuments.length}건)
              </h2>
              <p className="text-[11px] text-[#5F6368]">
                결재선에 {userName}님이 포함되어 요청된 문서를 검토하고 승인·반려할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "전체" },
              { id: "in_progress", label: "내 결재 대기" },
              { id: "approved", label: "승인 완료" },
              { id: "rejected", label: "반려" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as typeof statusFilter)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === f.id
                    ? "bg-[#E8F0FE] text-[#0B57D0] border-[#1A73E8]"
                    : "bg-white text-[#5F6368] border-[#DDE3EA] hover:bg-[#F1F5FB]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredReceivedDocs.length === 0 ? (
          <div className="bg-white border border-[#DDE3EA] rounded-2xl p-12 text-center text-xs text-[#5F6368]">
            현재 {userName}님에게 요청된 결재 문서가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReceivedDocs.map((doc) => {
              const isMyTurn =
                doc.status === "in_progress" &&
                doc.steps.some(
                  (s) =>
                    s.order === doc.currentStepOrder &&
                    s.status === "pending" &&
                    s.approverName.toLowerCase().includes(userName.trim().toLowerCase())
                );
              return (
                <div
                  key={doc.id}
                  className="bg-white border border-[#DDE3EA] rounded-2xl p-4 space-y-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                          {doc.docNumber}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-[#0B57D0] font-semibold">
                          {doc.docTypeName}
                        </span>
                        {isMyTurn && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                            내 결재 차례
                          </span>
                        )}
                        {doc.status === "approved" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                            최종 승인 완료
                          </span>
                        )}
                        {doc.status === "rejected" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                            반려됨
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-[#1F1F1F]">{doc.title}</h4>
                      <p className="text-[11px] text-[#5F6368]">
                        기안자: {doc.requesterName} ({doc.requesterDept})
                        {typeof doc.amount === "number" &&
                          ` · 금액: ${doc.amount.toLocaleString("ko-KR")}원`}
                        {` · 상신일: ${new Date(doc.createdAt).toLocaleString("ko-KR")}`}
                      </p>
                    </div>

                    {isMyTurn && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStepDecision(doc.id, "approve")}
                          disabled={actingDocId === doc.id}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => handleStepDecision(doc.id, "reject")}
                          disabled={actingDocId === doc.id}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold disabled:opacity-50"
                        >
                          반려
                        </button>
                      </div>
                    )}
                  </div>

                  {Object.keys(doc.formData || {}).length > 0 && (
                    <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#E6ECF3] grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {Object.entries(doc.formData).map(([k, v]) => (
                        <div key={k} className="truncate">
                          <span className="text-[#5F6368] font-medium">{k}: </span>
                          <span className="text-[#1F1F1F]">{v || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6ECF3]">
                    {doc.steps.map((s, idx) => (
                      <React.Fragment key={s.order}>
                        <div
                          className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
                            s.status === "approved"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : s.status === "pending"
                              ? "bg-amber-50 border-amber-300 text-amber-900 font-semibold"
                              : s.status === "rejected"
                              ? "bg-rose-50 border-rose-200 text-rose-800"
                              : "bg-slate-50 border-slate-200 text-slate-500"
                          }`}
                        >
                          <span>
                            {s.order}. {s.approverName} ({s.role})
                          </span>
                          {s.status === "approved" && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          {s.status === "pending" && (
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          {s.status === "rejected" && (
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                        </div>
                        {idx < doc.steps.length - 1 && (
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#F8FAFD]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700">
          {toastMsg}
        </div>
      )}

      {/* Top Header & Sub-Tabs */}
      <div className="bg-white border border-[#DDE3EA] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#E8F0FE] text-[#1A73E8]">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1F1F1F]">
                Approval Flow (전자결재)
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#0B57D0] border border-blue-200 font-semibold">
                {mcpSource === "remote_mcp" ? "MCP Server 연결됨" : "MCP 스키마 연동"}
              </span>
            </div>
            <p className="text-[11px] text-[#5F6368]">
              MCP 결재 규정 기반 기안 작성 · Preview 확인 · 결재선 진행 · 실행부서 전달 및 통계
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "compose", label: "기안 작성", icon: FileText },
            { id: "inbox", label: `결재 진행함 (${myDocuments.length})`, icon: Send },
            { id: "policies", label: "MCP 결재 규정", icon: BookOpen },
            { id: "stats", label: "결재 통계", icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as typeof subTab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  active
                    ? "bg-[#1A73E8] text-white shadow-sm"
                    : "bg-[#F1F5FB] text-[#444746] hover:bg-[#E4ECF7]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Compose Tab */}
      {subTab === "compose" && selectedTemplate && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Left: Dropdown + Conversational Form */}
          <form
            onSubmit={handleOpenPreview}
            className="xl:col-span-2 bg-white border border-[#DDE3EA] rounded-2xl p-5 space-y-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E6ECF3]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1F1F]">
                  결재문서 선택 및 항목 작성
                </h3>
                <p className="text-[11px] text-[#5F6368]">
                  드롭다운에서 문서를 선택하면 MCP 규정에 따라 필수/선택 항목이 안내됩니다.
                </p>
              </div>
              {onTriggerChatPrompt && (
                <button
                  type="button"
                  onClick={() =>
                    onTriggerChatPrompt(
                      "현재 상황에 어떤 결재 문서를 올려야 하는지 추천해주고, 필요한 항목을 대화로 안내해 줘."
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI에게 어떤 결재인지 물어보기
                </button>
              )}
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {formError}
              </div>
            )}

            {/* Dropdown & Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#444746] mb-1">
                  결재 문서 종류 선택 (MCP) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedTemplate.id}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-xs font-semibold text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      [{t.category}] {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#444746] mb-1">
                  기안 부서
                </label>
                <input
                  type="text"
                  value={requesterDept}
                  onChange={(e) => setRequesterDept(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={selectedTemplate.requiresAmount ? "sm:col-span-2" : "sm:col-span-3"}>
                <label className="block text-[11px] font-bold text-[#444746] mb-1">
                  문서 제목 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder={`예: ${selectedTemplate.name} - 11월 주요 건`}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                />
              </div>

              {selectedTemplate.requiresAmount && (
                <div>
                  <label className="block text-[11px] font-bold text-[#444746] mb-1">
                    결재 금액 (원)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="예: 1500000"
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                  />
                </div>
              )}
            </div>

            {/* Dynamic Fields from MCP Template */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1F1F1F]">
                  💬 채워야 할 항목 ({selectedTemplate.fields.length}개)
                </span>
                <span className="text-[10px] text-[#5F6368]">
                  * 표시는 필수 입력 항목입니다
                </span>
              </div>

              {selectedTemplate.fields.map((field) => (
                <div
                  key={field.key}
                  className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E6ECF3] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#1F1F1F]">
                      {field.label}
                      {field.required && <span className="text-rose-500 ml-1">*</span>}
                    </label>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        field.required
                          ? "bg-rose-50 text-rose-600 border border-rose-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}
                    >
                      {field.required ? "필수" : "선택"}
                    </span>
                  </div>

                  {field.type === "textarea" ? (
                    <textarea
                      rows={2}
                      value={formData[field.key] || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: e.target.value })
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                    />
                  ) : field.type === "select" ? (
                    <select
                      value={formData[field.key] || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                    >
                      <option value="">선택하세요</option>
                      {(field.options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.key] || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: e.target.value })
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8]"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Eye className="w-4 h-4" />
                결재문서 Preview 보기
              </button>
            </div>
          </form>

          {/* Right: Live MCP Policy & Approval Line Preview */}
          <div className="space-y-4">
            <div className="bg-white border border-[#DDE3EA] rounded-2xl p-4 space-y-3 shadow-sm">
              <h4 className="text-xs font-bold text-[#1F1F1F] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#1A73E8]" />
                MCP 문서 정의 요약
              </h4>
              <p className="text-xs text-[#444746] leading-relaxed">
                {selectedTemplate.summary}
              </p>
              <div className="p-2.5 rounded-xl bg-[#F8FAFD] border border-[#E6ECF3] text-[11px] text-[#5F6368]">
                <span className="font-semibold text-[#1F1F1F]">적용 상황: </span>
                {selectedTemplate.whenToUse}
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate">
                {selectedTemplate.mcpSource}
              </p>
            </div>

            {resolvedLine && (
              <div className="bg-white border border-[#DDE3EA] rounded-2xl p-4 space-y-3 shadow-sm">
                <h4 className="text-xs font-bold text-[#1F1F1F]">
                  적용 결재 순서 (조직도 · 금액 조건)
                </h4>
                <p className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-50 text-[#0B57D0] font-semibold inline-block">
                  {resolvedLine.conditionLabel}
                </p>

                <div className="space-y-2">
                  {resolvedLine.steps.map((s) => (
                    <div
                      key={s.order}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8FAFD] border border-[#E6ECF3]"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#1A73E8] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {s.order}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1F1F1F]">
                          {s.approverName}
                        </p>
                        <p className="text-[10px] text-[#5F6368]">{s.role}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#E6ECF3] flex items-center gap-2 text-xs text-[#188038]">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>
                    최종 완료 시 전달:{" "}
                    <strong>
                      {selectedTemplate.executionDept} ({selectedTemplate.executionAssignee})
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Inbox / Progress Tab */}
      {subTab === "inbox" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "all", label: "전체" },
              { id: "in_progress", label: "진행 중" },
              { id: "approved", label: "승인 완료" },
              { id: "rejected", label: "반려" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as typeof statusFilter)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === f.id
                    ? "bg-[#E8F0FE] text-[#0B57D0] border-[#1A73E8]"
                    : "bg-white text-[#5F6368] border-[#DDE3EA] hover:bg-[#F1F5FB]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredDocs.length === 0 ? (
            <div className="bg-white border border-[#DDE3EA] rounded-2xl p-10 text-center text-xs text-[#5F6368]">
              해당 상태의 결재 문서가 없습니다. [기안 작성] 탭에서 새 결재를 상신해 보세요.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white border border-[#DDE3EA] rounded-2xl p-4 space-y-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                          {doc.docNumber}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-[#0B57D0] font-semibold">
                          {doc.docTypeName}
                        </span>
                        {doc.status === "in_progress" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" /> 결재 진행 중
                          </span>
                        )}
                        {doc.status === "approved" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> 최종 승인 완료
                          </span>
                        )}
                        {doc.status === "rejected" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> 반려됨
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-[#1F1F1F]">{doc.title}</h4>
                      <p className="text-[11px] text-[#5F6368]">
                        기안자: {doc.requesterName} ({doc.requesterDept})
                        {typeof doc.amount === "number" &&
                          ` · 금액: ${doc.amount.toLocaleString("ko-KR")}원`}
                        {` · 상신일: ${new Date(doc.createdAt).toLocaleString("ko-KR")}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {doc.status === "in_progress" && (
                        <>
                          <button
                            onClick={() => handleStepDecision(doc.id, "approve")}
                            disabled={actingDocId === doc.id}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            현재 단계 승인
                          </button>
                          <button
                            onClick={() => handleStepDecision(doc.id, "reject")}
                            disabled={actingDocId === doc.id}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold disabled:opacity-50"
                          >
                            반려
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Step Flow */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6ECF3]">
                    {doc.steps.map((s, idx) => (
                      <React.Fragment key={s.order}>
                        <div
                          className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
                            s.status === "approved"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : s.status === "pending"
                              ? "bg-amber-50 border-amber-300 text-amber-900 font-semibold"
                              : s.status === "rejected"
                              ? "bg-rose-50 border-rose-200 text-rose-800"
                              : "bg-slate-50 border-slate-200 text-slate-500"
                          }`}
                        >
                          <span>
                            {s.order}. {s.approverName} ({s.role})
                          </span>
                          {s.status === "approved" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {s.status === "pending" && <Clock className="w-3.5 h-3.5 text-amber-600" />}
                          {s.status === "rejected" && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                        </div>
                        {idx < doc.steps.length - 1 && (
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {doc.executionDeliveredAt && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                      <span>
                        📨 실행부서 전달 완료:{" "}
                        <strong>
                          {doc.executionDept} · {doc.executionAssignee}
                        </strong>
                      </span>
                      <span className="text-[10px] text-emerald-600">
                        {new Date(doc.executionDeliveredAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. MCP Policies Tab */}
      {subTab === "policies" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-[#DDE3EA] rounded-2xl p-5 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#0B57D0] font-semibold">
                    {t.category}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{t.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(JSON.parse(JSON.stringify(t)))}
                  className="px-2.5 py-1 rounded-lg bg-[#F1F5FB] hover:bg-[#E4ECF7] text-[#1A73E8] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                >
                  <Edit3 className="w-3 h-3" />
                  수정
                </button>
              </div>
              <h4 className="text-sm font-bold text-[#1F1F1F]">{t.name}</h4>
              <p className="text-xs text-[#444746]">{t.summary}</p>
              <div className="space-y-1.5 pt-2 border-t border-[#E6ECF3]">
                <p className="text-[11px] font-bold text-[#1F1F1F]">금액 조건별 결재 순서</p>
                {t.amountRules.map((r, i) => (
                  <p key={i} className="text-[11px] text-[#5F6368]">
                    • {r.conditionLabel}:{" "}
                    <span className="text-[#1F1F1F] font-medium">
                      {r.steps.map((s) => `${s.role}(${s.approverName})`).join(" → ")}
                    </span>
                  </p>
                ))}
              </div>
              <div className="pt-2 border-t border-[#E6ECF3] flex items-center justify-between text-[11px]">
                <span className="text-[#5F6368]">
                  필수 {t.fields.filter((f) => f.required).length}개 · 선택{" "}
                  {t.fields.filter((f) => !f.required).length}개
                </span>
                <span className="text-[#188038] font-semibold">
                  실행: {t.executionDept} ({t.executionAssignee})
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Stats Tab */}
      {subTab === "stats" && stats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1F1F1F]">결재 문서별 통계 현황</h3>
            {onTriggerChatPrompt && (
              <button
                onClick={() =>
                  onTriggerChatPrompt(
                    "현재까지 DB에 기록된 결재 문서 통계를 문서 종류별, 상태별, 총 금액 기준으로 요약해서 알려줘."
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                대화로 통계 물어보기
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "총 상신 건수", value: `${stats.totalCount}건`, color: "text-[#1A73E8]" },
              { label: "결재 진행 중", value: `${stats.inProgressCount}건`, color: "text-amber-600" },
              { label: "최종 승인 (실행전달)", value: `${stats.approvedCount}건`, color: "text-emerald-600" },
              {
                label: "총 결재 금액",
                value: `${stats.totalAmount.toLocaleString("ko-KR")}원`,
                color: "text-[#1F1F1F]",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white border border-[#DDE3EA] rounded-2xl p-4 shadow-sm"
              >
                <p className="text-[11px] text-[#5F6368] font-semibold">{card.label}</p>
                <p className={`text-lg font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#DDE3EA] rounded-2xl p-5 space-y-3 shadow-sm">
            <h4 className="text-xs font-bold text-[#1F1F1F]">결재문서 종류별 집계</h4>
            {stats.byDocType.length === 0 ? (
              <p className="text-xs text-[#5F6368]">아직 상신된 결재 문서가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E6ECF3] text-[#5F6368]">
                      <th className="py-2 pr-4">문서 종류</th>
                      <th className="py-2 px-3">총 건수</th>
                      <th className="py-2 px-3">진행 중</th>
                      <th className="py-2 px-3">승인 완료</th>
                      <th className="py-2 px-3">반려</th>
                      <th className="py-2 pl-3 text-right">누적 금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byDocType.map((row) => (
                      <tr key={row.docTypeId} className="border-b border-[#F1F5FB]">
                        <td className="py-2.5 pr-4 font-semibold text-[#1F1F1F]">
                          {row.docTypeName}
                        </td>
                        <td className="py-2.5 px-3">{row.count}건</td>
                        <td className="py-2.5 px-3 text-amber-600">{row.inProgressCount}건</td>
                        <td className="py-2.5 px-3 text-emerald-600">{row.approvedCount}건</td>
                        <td className="py-2.5 px-3 text-rose-600">{row.rejectedCount}건</td>
                        <td className="py-2.5 pl-3 text-right font-semibold">
                          {row.totalAmount.toLocaleString("ko-KR")}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline AI Chat Box at bottom of Compose & Stats tabs */}
      {(subTab === "compose" || subTab === "stats") && (
        <div className="bg-white border border-[#DDE3EA] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-[#F8FAFD] border-b border-[#E6ECF3] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#E8F0FE] text-[#1A73E8]">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1F1F1F]">
                  Approval Flow AI 대화창
                </h4>
                <p className="text-[10px] text-[#5F6368]">
                  {subTab === "compose"
                    ? "상황에 맞는 결재 추천, 항목 작성 도움 또는 대화로 바로 결재를 상신할 수 있습니다."
                    : "DB에 기록된 결재 문서별 건수, 금액, 진행 현황 통계를 대화로 물어보세요."}
                </p>
              </div>
            </div>
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={() => setChatMessages([])}
                className="text-[11px] text-[#5F6368] hover:text-[#1F1F1F] px-2.5 py-1 rounded-lg hover:bg-[#EAEFF6]"
              >
                대화 비우기
              </button>
            )}
          </div>

          {/* Quick suggestion chips */}
          <div className="px-4 pt-3 flex flex-wrap gap-1.5">
            {(subTab === "compose"
              ? [
                  "학회 참가비 결제를 올리려면 어떤 결재 문서를 선택해야 해?",
                  `${selectedTemplate?.name || "일반 품의서"}의 필수 항목과 금액별 결재선 알려줘`,
                  "노트북 250만원 구매요청서 올릴 때 결재 순서가 어떻게 돼?",
                ]
              : [
                  "현재까지 결재 문서별 건수와 누적 금액 통계를 요약해 줘",
                  "진행 중인 결재와 최종 승인 완료된 건을 구분해서 알려줘",
                  "실행부서로 전달 완료된 결재 문서 현황 알려줘",
                ]
            ).map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={chatLoading}
                onClick={() => sendInlineChat(chip)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-[#F1F5FB] hover:bg-[#E4ECF7] text-[#0B57D0] font-medium transition-colors disabled:opacity-50"
              >
                ✨ {chip}
              </button>
            ))}
          </div>

          {/* Chat messages area */}
          {(chatMessages.length > 0 || activeToolCalls.length > 0 || chatLoading) && (
            <div className="px-4 py-3 max-h-80 overflow-y-auto space-y-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="w-full max-w-2xl space-y-1.5 mb-1.5">
                      {msg.toolCalls.map((tc) => (
                        <ToolCallCard key={tc.id} tool={tc} />
                      ))}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#1A73E8] text-white rounded-br-sm"
                        : "bg-[#F8FAFD] border border-[#E6ECF3] text-[#1F1F1F] rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {activeToolCalls.length > 0 && (
                <div className="space-y-1.5 max-w-2xl">
                  {activeToolCalls.map((tc) => (
                    <ToolCallCard key={tc.id} tool={tc} />
                  ))}
                </div>
              )}

              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-[#5F6368]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A73E8]" />
                  <span>답변을 생성하고 있습니다...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Input bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendInlineChat();
            }}
            className="p-3 border-t border-[#E6ECF3] flex items-center gap-2 bg-[#F8FAFD]"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                subTab === "compose"
                  ? "어떤 결재를 올려야 하는지, 또는 입력 항목을 대화로 물어보세요..."
                  : "결재 문서별 통계나 현황을 자유롭게 질문해 보세요..."
              }
              disabled={chatLoading}
              className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-[#DDE3EA] text-xs text-[#1F1F1F] focus:outline-none focus:border-[#1A73E8] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="px-4 py-2 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              전송
            </button>
          </form>
        </div>
      )}

      {/* Official Document Preview Modal */}
      {showPreview && selectedTemplate && resolvedLine && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white border border-[#DDE3EA] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[#E6ECF3] flex items-center justify-between bg-[#F8FAFD]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1F1F]">
                  결재문서 최종 Preview 확인
                </h3>
                <p className="text-[11px] text-[#5F6368]">
                  내용을 확인한 후 [결재 상신 확인]을 누르면 첫 번째 결재자에게 전달됩니다.
                </p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#1F1F1F]">
              {/* Document Header + Approval Stamp Grid */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b-2 border-[#1F1F1F]">
                <div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-[#0B57D0] font-semibold">
                    {selectedTemplate.category}
                  </span>
                  <h2 className="text-xl font-bold mt-1">{selectedTemplate.name}</h2>
                  <p className="text-[11px] text-[#5F6368] mt-1">
                    기안자: {userName} ({requesterDept})
                  </p>
                </div>

                <div className="flex border border-[#CBD5E1] rounded-lg overflow-hidden shrink-0">
                  {resolvedLine.steps.map((s) => (
                    <div
                      key={s.order}
                      className="w-24 text-center border-r last:border-r-0 border-[#CBD5E1]"
                    >
                      <div className="bg-[#F1F5FB] py-1 px-1.5 text-[10px] font-bold border-b border-[#CBD5E1]">
                        {s.role}
                      </div>
                      <div className="py-3 px-1.5 text-[11px] font-semibold">
                        {s.approverName}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F8FAFD] p-3.5 rounded-xl border border-[#E6ECF3]">
                <div>
                  <span className="text-[10px] text-[#5F6368] block">문서 제목</span>
                  <span className="font-bold">{docTitle}</span>
                </div>
                {selectedTemplate.requiresAmount && (
                  <div>
                    <span className="text-[10px] text-[#5F6368] block">결재 금액</span>
                    <span className="font-bold text-[#1A73E8]">
                      {typeof numericAmount === "number" && !Number.isNaN(numericAmount)
                        ? `${numericAmount.toLocaleString("ko-KR")}원`
                        : "미입력 (0원 기준)"}
                    </span>
                  </div>
                )}
              </div>

              {/* Fields Table */}
              <div className="border border-[#DDE3EA] rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {selectedTemplate.fields.map((f) => (
                      <tr key={f.key} className="border-b last:border-b-0 border-[#E6ECF3]">
                        <th className="w-1/3 bg-[#F8FAFD] text-left px-3.5 py-2.5 font-semibold text-[#444746] border-r border-[#E6ECF3]">
                          {f.label}
                        </th>
                        <td className="px-3.5 py-2.5 whitespace-pre-wrap">
                          {(formData[f.key] || "").trim() || (
                            <span className="text-slate-400">(미입력)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                모든 결재가 완료되면 실행부서{" "}
                <strong>
                  {selectedTemplate.executionDept} ({selectedTemplate.executionAssignee})
                </strong>
                에게 자동 전달됩니다.
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-[#E6ECF3] flex items-center justify-end gap-2 bg-[#F8FAFD]">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 rounded-xl bg-white border border-[#DDE3EA] text-xs font-semibold text-[#444746] hover:bg-slate-50"
              >
                수정하기
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                결재 상신 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit MCP Policy Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white border border-[#DDE3EA] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-[#E6ECF3] flex items-center justify-between bg-[#F8FAFD]">
              <div>
                <h3 className="text-sm font-bold text-[#1F1F1F]">
                  MCP 결재 규정 수정 — {editingTemplate.name}
                </h3>
                <p className="text-[11px] text-[#5F6368]">
                  문서 기본 정보, 실행부서, 금액 조건별 결재 순서, 필수/선택 입력 항목을 수정합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              id="edit-mcp-policy-form"
              onSubmit={handleSaveTemplate}
              className="p-5 overflow-y-auto space-y-5 text-xs text-[#1F1F1F]"
            >
              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#444746] mb-1">
                    결재 문서 제목
                  </label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#444746] mb-1">
                    카테고리
                  </label>
                  <input
                    type="text"
                    value={editingTemplate.category}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, category: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#444746] mb-1">
                  문서 설명
                </label>
                <textarea
                  rows={2}
                  value={editingTemplate.summary}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, summary: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#444746] mb-1">
                  적용 상황 (AI 추천 기준)
                </label>
                <input
                  type="text"
                  value={editingTemplate.whenToUse}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, whenToUse: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#444746] mb-1">
                    최종 실행부서
                  </label>
                  <input
                    type="text"
                    value={editingTemplate.executionDept}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, executionDept: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#444746] mb-1">
                    실행 담당자
                  </label>
                  <input
                    type="text"
                    value={editingTemplate.executionAssignee}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        executionAssignee: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#444746] mb-1">
                    담당자 이메일
                  </label>
                  <input
                    type="email"
                    value={editingTemplate.executionEmail}
                    onChange={(e) =>
                      setEditingTemplate({ ...editingTemplate, executionEmail: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#DDE3EA]"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={editingTemplate.requiresAmount}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      requiresAmount: e.target.checked,
                    })
                  }
                />
                결재 금액 입력 필수/사용 여부
              </label>

              {/* Amount Rules & Approval Lines */}
              <div className="space-y-2.5 pt-2 border-t border-[#E6ECF3]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1F1F1F]">금액 조건별 결재 순서</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingTemplate({
                        ...editingTemplate,
                        amountRules: [
                          ...editingTemplate.amountRules,
                          {
                            minAmount: 0,
                            maxAmount: null,
                            conditionLabel: "새 금액 조건",
                            steps: [{ role: "소속 팀장", approverName: "박지훈 팀장" }],
                          },
                        ],
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#E8F0FE] text-[#0B57D0] text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 조건 추가
                  </button>
                </div>

                {editingTemplate.amountRules.map((rule, rIdx) => (
                  <div
                    key={rIdx}
                    className="p-3 rounded-xl bg-[#F8FAFD] border border-[#E6ECF3] space-y-2"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                      <input
                        type="text"
                        value={rule.conditionLabel}
                        onChange={(e) => {
                          const next = [...editingTemplate.amountRules];
                          next[rIdx] = { ...rule, conditionLabel: e.target.value };
                          setEditingTemplate({ ...editingTemplate, amountRules: next });
                        }}
                        placeholder="조건 설명"
                        className="sm:col-span-2 px-2.5 py-1.5 rounded-lg bg-white border border-[#DDE3EA]"
                      />
                      <input
                        type="number"
                        value={rule.minAmount}
                        onChange={(e) => {
                          const next = [...editingTemplate.amountRules];
                          next[rIdx] = { ...rule, minAmount: Number(e.target.value) || 0 };
                          setEditingTemplate({ ...editingTemplate, amountRules: next });
                        }}
                        placeholder="최소 금액"
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DDE3EA]"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={rule.maxAmount === null ? "" : rule.maxAmount}
                          onChange={(e) => {
                            const next = [...editingTemplate.amountRules];
                            next[rIdx] = {
                              ...rule,
                              maxAmount:
                                e.target.value.trim() === "" ? null : Number(e.target.value),
                            };
                            setEditingTemplate({ ...editingTemplate, amountRules: next });
                          }}
                          placeholder="상한 (비우면 무제한)"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#DDE3EA]"
                        />
                        {editingTemplate.amountRules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = editingTemplate.amountRules.filter(
                                (_, idx) => idx !== rIdx
                              );
                              setEditingTemplate({ ...editingTemplate, amountRules: next });
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5 pl-2 border-l-2 border-[#1A73E8]/30">
                      {rule.steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-[#5F6368] w-5">
                            {sIdx + 1}.
                          </span>
                          <input
                            type="text"
                            value={step.role}
                            onChange={(e) => {
                              const nextRules = [...editingTemplate.amountRules];
                              const nextSteps = [...rule.steps];
                              nextSteps[sIdx] = { ...step, role: e.target.value };
                              nextRules[rIdx] = { ...rule, steps: nextSteps };
                              setEditingTemplate({ ...editingTemplate, amountRules: nextRules });
                            }}
                            placeholder="직책 (예: 소속 팀장)"
                            className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-[#DDE3EA]"
                          />
                          <input
                            type="text"
                            value={step.approverName}
                            onChange={(e) => {
                              const nextRules = [...editingTemplate.amountRules];
                              const nextSteps = [...rule.steps];
                              nextSteps[sIdx] = { ...step, approverName: e.target.value };
                              nextRules[rIdx] = { ...rule, steps: nextSteps };
                              setEditingTemplate({ ...editingTemplate, amountRules: nextRules });
                            }}
                            placeholder="결재자명"
                            className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-[#DDE3EA]"
                          />
                          {rule.steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextRules = [...editingTemplate.amountRules];
                                nextRules[rIdx] = {
                                  ...rule,
                                  steps: rule.steps.filter((_, idx) => idx !== sIdx),
                                };
                                setEditingTemplate({ ...editingTemplate, amountRules: nextRules });
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const nextRules = [...editingTemplate.amountRules];
                          nextRules[rIdx] = {
                            ...rule,
                            steps: [...rule.steps, { role: "결재자", approverName: "" }],
                          };
                          setEditingTemplate({ ...editingTemplate, amountRules: nextRules });
                        }}
                        className="text-[11px] text-[#1A73E8] font-semibold hover:underline"
                      >
                        + 결재 단계 추가
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fields */}
              <div className="space-y-2.5 pt-2 border-t border-[#E6ECF3]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1F1F1F]">입력 항목 (필수 / 선택)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingTemplate({
                        ...editingTemplate,
                        fields: [
                          ...editingTemplate.fields,
                          {
                            key: `field_${Date.now()}`,
                            label: "새 입력 항목",
                            type: "text",
                            required: false,
                            placeholder: "",
                          },
                        ],
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#E8F0FE] text-[#0B57D0] text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 항목 추가
                  </button>
                </div>

                {editingTemplate.fields.map((field, fIdx) => (
                  <div
                    key={field.key}
                    className="p-3 rounded-xl bg-[#F8FAFD] border border-[#E6ECF3] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                  >
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => {
                        const next = [...editingTemplate.fields];
                        next[fIdx] = { ...field, label: e.target.value };
                        setEditingTemplate({ ...editingTemplate, fields: next });
                      }}
                      placeholder="항목명"
                      className="sm:col-span-4 px-2.5 py-1.5 rounded-lg bg-white border border-[#DDE3EA]"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => {
                        const next = [...editingTemplate.fields];
                        next[fIdx] = {
                          ...field,
                          type: e.target.value as typeof field.type,
                        };
                        setEditingTemplate({ ...editingTemplate, fields: next });
                      }}
                      className="sm:col-span-2 px-2 py-1.5 rounded-lg bg-white border border-[#DDE3EA]"
                    >
                      <option value="text">텍스트</option>
                      <option value="textarea">장문</option>
                      <option value="number">숫자</option>
                      <option value="date">날짜</option>
                      <option value="select">선택형</option>
                    </select>
                    <input
                      type="text"
                      value={
                        field.type === "select"
                          ? (field.options || []).join(", ")
                          : field.placeholder || ""
                      }
                      onChange={(e) => {
                        const next = [...editingTemplate.fields];
                        if (field.type === "select") {
                          next[fIdx] = {
                            ...field,
                            options: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          };
                        } else {
                          next[fIdx] = { ...field, placeholder: e.target.value };
                        }
                        setEditingTemplate({ ...editingTemplate, fields: next });
                      }}
                      placeholder={
                        field.type === "select" ? "옵션 (쉼표로 구분)" : "안내 문구"
                      }
                      className="sm:col-span-4 px-2.5 py-1.5 rounded-lg bg-white border border-[#DDE3EA]"
                    />
                    <div className="sm:col-span-2 flex items-center justify-end gap-2">
                      <label className="flex items-center gap-1 text-[11px] font-semibold">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => {
                            const next = [...editingTemplate.fields];
                            next[fIdx] = { ...field, required: e.target.checked };
                            setEditingTemplate({ ...editingTemplate, fields: next });
                          }}
                        />
                        필수
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const next = editingTemplate.fields.filter(
                            (_, idx) => idx !== fIdx
                          );
                          setEditingTemplate({ ...editingTemplate, fields: next });
                        }}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </form>

            <div className="px-5 py-3.5 border-t border-[#E6ECF3] flex items-center justify-end gap-2 bg-[#F8FAFD]">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-xl bg-white border border-[#DDE3EA] text-xs font-semibold text-[#444746]"
              >
                취소
              </button>
              <button
                type="submit"
                form="edit-mcp-policy-form"
                disabled={savingTemplate}
                className="px-5 py-2 rounded-xl bg-[#1A73E8] hover:bg-[#1557B0] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingTemplate && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                규정 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
