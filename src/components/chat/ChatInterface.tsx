"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, Attachment, ToolCallRecord } from "@/lib/db";
import MessageItem from "./MessageItem";
import ToolCallCard from "./ToolCallCard";
import { Send, Paperclip, X, Sparkles, Loader2, ArrowDown } from "lucide-react";

interface ChatInterfaceProps {
  sessionId: string;
  initialPrompt?: string;
  onRefreshData?: () => void;
  onClearInitialPrompt?: () => void;
}

export default function ChatInterface({
  sessionId,
  initialPrompt,
  onRefreshData,
  onClearInitialPrompt,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallRecord[]>([]);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto trigger initialPrompt if passed
  useEffect(() => {
    if (initialPrompt && !isLoading) {
      handleSend(initialPrompt);
      onClearInitialPrompt?.();
    }
  }, [initialPrompt]);

  // Load session messages
  const fetchMessages = async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        const sessionMsgs = (data.messages || []).filter(
          (m: ChatMessage) => m.sessionId === sessionId
        );
        setMessages(sessionMsgs);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [sessionId]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, streamingText, currentToolCalls]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isNearBottom);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            dataUrl: result,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (customText?: string) => {
    const textToSend = customText !== undefined ? customText : input;
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;

    const currentAttachments = [...attachments];
    const userMessageContent = textToSend.trim();

    // Optimistically show user message
    const tempUserMsg: ChatMessage = {
      id: "temp-user-" + Date.now(),
      sessionId,
      role: "user",
      content: userMessageContent || "(첨부파일 전송)",
      attachments: currentAttachments,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);
    setStreamingText("");
    setCurrentToolCalls([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: userMessageContent,
          attachments: currentAttachments,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("서버와의 통신에 실패했습니다.");
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
              setCurrentToolCalls((prev) => [
                ...prev,
                { id: parsed.id, name: parsed.name, args: parsed.args },
              ]);
            } else if (eventType === "tool_end") {
              setCurrentToolCalls((prev) =>
                prev.map((t) =>
                  t.id === parsed.id ? { ...t, result: parsed.result } : t
                )
              );
              // Trigger refresh of todos or memory if tools were used
              onRefreshData?.();
            } else if (eventType === "text") {
              setStreamingText((prev) => prev + (parsed.chunk || ""));
            } else if (eventType === "done") {
              await fetchMessages();
              onRefreshData?.();
              setStreamingText("");
              setCurrentToolCalls([]);
            }
          } catch (pErr) {
            console.error("Event parse error:", pErr, dataStr);
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: "error-" + Date.now(),
          sessionId,
          role: "assistant",
          content: `⚠️ 오류가 발생했습니다: ${errMsg}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setStreamingText("");
      setCurrentToolCalls([]);
      fetchMessages();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const quickPrompts = [
    "오늘의 할 일 목록과 남은 일정 정리해줘",
    "2026년 최신 AI 트렌드 검색해서 알려줘",
    "내 선호도와 기억된 정보를 바탕으로 인사해줘",
  ];

  return (
    <div className="relative flex flex-col h-full bg-slate-950/40">
      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-slate-800/40"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-junior-600 to-cyan-500 flex items-center justify-center text-white shadow-xl shadow-junior-500/20 mb-4 animate-bounce">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">
              Junior 준비 완료!
            </h2>
            <p className="text-sm text-slate-400 max-w-md mb-6">
              업무, 개발, 일정, 정보 탐색을 능동적으로 돕는 맞춤형 AI 비서입니다.
              무엇이든 편하게 이야기해 보세요.
            </p>

            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(p)}
                  className="text-xs px-3 py-2 bg-slate-900 border border-slate-800 hover:border-junior-500/50 hover:bg-slate-800/80 text-slate-300 rounded-full transition-all"
                >
                  ✨ {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageItem key={msg.id} message={msg} />)
        )}

        {/* Live streaming / active tool calling bubble */}
        {isLoading && (
          <div className="flex gap-3 px-4 py-3 sm:px-6 bg-slate-900/30">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-junior-600 to-cyan-400 flex items-center justify-center text-white shrink-0 shadow-md">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-slate-200">Junior</span>
                <span className="text-[11px] text-junior-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> 생각하는 중...
                </span>
              </div>

              {/* Active Tool Calls */}
              {currentToolCalls.map((t) => (
                <ToolCallCard
                  key={t.id}
                  tool={t}
                  status={t.result ? "completed" : "running"}
                />
              ))}

              {/* Streaming Text */}
              {streamingText ? (
                <div className="prose prose-invert prose-sm max-w-none text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {streamingText}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-junior-400 animate-ping" />
                  응답을 생성하고 있습니다...
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-24 right-6 p-2 bg-slate-800/90 border border-slate-700 text-slate-200 rounded-full shadow-lg hover:bg-slate-700 transition-all"
          title="맨 아래로 스크롤"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* Input Box Area */}
      <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/70 backdrop-blur-md">
        {/* Attachment preview pills */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200"
              >
                <span className="truncate max-w-[160px]">{att.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="text-slate-400 hover:text-rose-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-2 bg-slate-950/70 border border-slate-800 rounded-xl p-1.5 focus-within:border-junior-500/60 focus-within:ring-1 focus-within:ring-junior-500/30 transition-all">
          {/* File Upload Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-400 hover:text-junior-400 hover:bg-slate-800/60 rounded-lg transition-colors shrink-0"
            title="파일 첨부 (이미지, 문서, 코드)"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Auto-expanding Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Junior에게 무엇이든 물어보거나 지시하세요... (Shift+Enter로 줄바꿈)"
            className="flex-1 max-h-[180px] bg-transparent text-sm text-slate-100 placeholder:text-slate-500 resize-none outline-none py-2 px-1 leading-relaxed"
          />

          {/* Send Button */}
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            className="p-2 bg-junior-600 hover:bg-junior-500 disabled:opacity-30 disabled:hover:bg-junior-600 text-white rounded-lg transition-colors shrink-0 shadow-md shadow-junior-600/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-500">
          <span>Junior는 웹 검색, 할 일 관리, 장기 기억 도구를 능동적으로 활용합니다.</span>
          <span className="hidden sm:inline">Enter로 전송</span>
        </div>
      </div>
    </div>
  );
}
