"use client";

import React, { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import ToolCallCard from "./ToolCallCard";
import {
  Copy,
  Check,
  Sparkles,
  User,
  FileText,
  Image as ImageIcon,
  Mail,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from "lucide-react";

interface MessageItemProps {
  message: ChatMessage;
}

interface ParsedEmailBriefingItem {
  id: string;
  title: string;
  bodyMarkdown: string;
}

interface ParsedEmailBriefing {
  introMarkdown: string;
  items: ParsedEmailBriefingItem[];
  outroMarkdown: string;
}

function cleanHorizontalRules(text: string): string {
  return text
    .replace(/^(?:\s*---\s*\n+)+/g, "")
    .replace(/(?:\n+\s*---\s*)+$/g, "")
    .trim();
}

function stripOuterBold(text: string): string {
  return text.replace(/^\*\*(.+)\*\*$/, "$1").trim();
}

function parseEmailBriefingContent(message: ChatMessage): ParsedEmailBriefing | null {
  if (message.role !== "assistant" || !message.content) return null;

  const hasGmailToolCall = Boolean(
    message.toolCalls?.some((t) => t.name === "manage_gmail")
  );
  const hasEmailBriefingKeywords =
    /수신된.*메일|메일.*브리핑|이메일.*확인|중요 메일|받은.*메일/.test(message.content);

  if (!hasGmailToolCall && !hasEmailBriefingKeywords) {
    return null;
  }

  const raw = message.content;

  // Strategy 1: Markdown headings (## / ### / ####) representing each briefed email item
  const headingRegex = /^(#{2,4})\s+(.+)$/gm;
  const matches = Array.from(raw.matchAll(headingRegex));

  if (matches.length >= 2 || (hasGmailToolCall && matches.length >= 1)) {
    const firstMatchIndex = matches[0].index ?? 0;
    const introMarkdown = cleanHorizontalRules(raw.slice(0, firstMatchIndex));
    const items: ParsedEmailBriefingItem[] = [];
    let outroMarkdown = "";

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const title = stripOuterBold(current[2].trim());
      const sectionStart = (current.index ?? 0) + current[0].length;
      const sectionEnd =
        i + 1 < matches.length ? (matches[i + 1].index ?? raw.length) : raw.length;

      let sectionBody = raw.slice(sectionStart, sectionEnd);

      // For the last section, separate trailing outro after '---' or closing paragraph
      if (i === matches.length - 1) {
        const hrParts = sectionBody.split(/\n\s*---\s*\n/);
        if (hrParts.length > 1) {
          sectionBody = hrParts.slice(0, -1).join("\n\n");
          outroMarkdown = cleanHorizontalRules(hrParts[hrParts.length - 1]);
        } else {
          // Check if the final paragraph is a closing question/remark
          const paragraphs = sectionBody.trim().split(/\n{2,}/);
          if (paragraphs.length > 1) {
            const lastPara = paragraphs[paragraphs.length - 1].trim();
            if (
              /^(추가로|혹시|더 궁금|필요하시|어느 메일|어떤 메일|위 메일|일정에 등록)/.test(
                lastPara.replace(/^[💡📌✨\s]+/, "")
              )
            ) {
              outroMarkdown = lastPara;
              sectionBody = paragraphs.slice(0, -1).join("\n\n");
            }
          }
        }
      }

      const cleanedBody = cleanHorizontalRules(sectionBody);
      items.push({
        id: `heading-email-${i}`,
        title,
        bodyMarkdown: cleanedBody || "세부 브리핑 내용이 없습니다.",
      });
    }

    if (items.length > 0) {
      return {
        introMarkdown,
        items,
        outroMarkdown,
      };
    }
  }

  // Strategy 2: Numbered list items with bold titles (e.g. "1. **제목**: 내용")
  const lines = raw.split("\n");
  const numberedItemRegex = /^\s*(\d+)\.\s*\*\*(.+?)\*\*\s*(?:[:：\-–—]\s*(.*))?$/;
  let firstItemLineIdx = -1;
  let lastItemLineIdx = -1;

  const numberedItems: ParsedEmailBriefingItem[] = [];
  let currentItem: { num: string; title: string; bodyLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(numberedItemRegex);
    if (match) {
      if (firstItemLineIdx === -1) firstItemLineIdx = i;
      lastItemLineIdx = i;
      if (currentItem) {
        numberedItems.push({
          id: `num-email-${numberedItems.length}`,
          title: `${currentItem.num}. ${stripOuterBold(currentItem.title)}`,
          bodyMarkdown: currentItem.bodyLines.join("\n").trim() || "세부 브리핑 내용이 없습니다.",
        });
      }
      currentItem = {
        num: match[1],
        title: match[2].trim(),
        bodyLines: match[3] ? [match[3].trim()] : [],
      };
    } else if (currentItem) {
      // Continuation sub-bullet or indented line belonging to the current numbered item
      if (/^\s{2,}[-*•]/.test(line) || /^\s{2,}\S/.test(line)) {
        lastItemLineIdx = i;
        currentItem.bodyLines.push(line.trim());
      } else if (line.trim() === "") {
        // Allow blank line between numbered items
      } else {
        // Non-indented non-numbered line ends the numbered list block
        numberedItems.push({
          id: `num-email-${numberedItems.length}`,
          title: `${currentItem.num}. ${stripOuterBold(currentItem.title)}`,
          bodyMarkdown: currentItem.bodyLines.join("\n").trim() || "세부 브리핑 내용이 없습니다.",
        });
        currentItem = null;
      }
    }
  }

  if (currentItem) {
    numberedItems.push({
      id: `num-email-${numberedItems.length}`,
      title: `${currentItem.num}. ${stripOuterBold(currentItem.title)}`,
      bodyMarkdown: currentItem.bodyLines.join("\n").trim() || "세부 브리핑 내용이 없습니다.",
    });
  }

  if (numberedItems.length >= 2 && firstItemLineIdx !== -1) {
    const introMarkdown = cleanHorizontalRules(
      lines.slice(0, firstItemLineIdx).join("\n")
    );
    const outroMarkdown = cleanHorizontalRules(
      lines.slice(lastItemLineIdx + 1).join("\n")
    );
    return {
      introMarkdown,
      items: numberedItems,
      outroMarkdown,
    };
  }

  return null;
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words text-slate-200 leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-junior-400 hover:underline"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <div className="relative group/code my-2.5">
              <pre className="overflow-x-auto p-3 text-xs bg-slate-950/80 border border-slate-800 rounded-lg">
                {children}
              </pre>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function MessageItem({ message }: MessageItemProps) {
  const isAssistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const [selectedEmailIds, setSelectedEmailIds] = useState<string[]>([]);

  const parsedBriefing = useMemo(
    () => (isAssistant ? parseEmailBriefingContent(message) : null),
    [isAssistant, message]
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleEmailItem = (id: string) => {
    setSelectedEmailIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAllEmails = () => {
    if (!parsedBriefing) return;
    if (selectedEmailIds.length === parsedBriefing.items.length) {
      setSelectedEmailIds([]);
    } else {
      setSelectedEmailIds(parsedBriefing.items.map((item) => item.id));
    }
  };

  return (
    <div
      className={`group flex gap-3 px-4 py-3 sm:px-6 transition-colors ${
        isAssistant ? "bg-slate-900/30" : "bg-transparent"
      }`}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5">
        {isAssistant ? (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-junior-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-junior-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <User className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-200">
              {isAssistant ? "Junior" : "나"}
            </span>
            <span className="text-[11px] text-slate-500">
              {formatDate(message.timestamp)}
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800/60"
            title="메시지 복사"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Attachments preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {message.attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-md text-xs text-slate-200"
              >
                {att.type.startsWith("image/") ? (
                  <ImageIcon className="w-3.5 h-3.5 text-junior-400" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span className="truncate max-w-[180px]">{att.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tool Call Cards */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1 mb-2">
            {message.toolCalls.map((tool) => (
              <ToolCallCard key={tool.id} tool={tool} status="completed" />
            ))}
          </div>
        )}

        {/* Email Briefing Interactive Subject-Only View vs Standard Markdown */}
        {parsedBriefing ? (
          <div className="space-y-3">
            {parsedBriefing.introMarkdown && (
              <MarkdownBlock content={parsedBriefing.introMarkdown} />
            )}

            <div className="rounded-xl border border-slate-800/90 bg-slate-950/60 p-3 space-y-2 shadow-inner">
              <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-800/70">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    주요 메일 브리핑 ({parsedBriefing.items.length}건)
                  </span>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    · 제목을 클릭하면 핵심 내용을 보여줍니다
                  </span>
                </div>

                <button
                  type="button"
                  onClick={toggleAllEmails}
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
                >
                  <ChevronsUpDown className="w-3 h-3" />
                  {selectedEmailIds.length === parsedBriefing.items.length
                    ? "전체 접기"
                    : "전체 펼치기"}
                </button>
              </div>

              <div className="space-y-1.5">
                {parsedBriefing.items.map((item) => {
                  const isSelected = selectedEmailIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isSelected
                          ? "border-rose-500/40 bg-slate-900/90 shadow-md"
                          : "border-slate-800/80 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleEmailItem(item.id)}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                              isSelected ? "bg-rose-400" : "bg-slate-600"
                            }`}
                          />
                          <span
                            className={`text-xs sm:text-sm font-medium truncate ${
                              isSelected ? "text-rose-200 font-semibold" : "text-slate-200"
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                              isSelected
                                ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                : "bg-slate-800/80 text-slate-400 border-slate-700/60"
                            }`}
                          >
                            {isSelected ? "내용 닫기" : "내용 보기"}
                          </span>
                          {isSelected ? (
                            <ChevronUp className="w-4 h-4 text-rose-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {isSelected && (
                        <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/70">
                          <MarkdownBlock content={item.bodyMarkdown} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {parsedBriefing.outroMarkdown && (
              <MarkdownBlock content={parsedBriefing.outroMarkdown} />
            )}
          </div>
        ) : (
          <MarkdownBlock content={message.content} />
        )}
      </div>
    </div>
  );
}
