import { NextRequest } from "next/server";
import { getAgentModel } from "@/lib/gemini";
import { getDb, saveDb, ChatMessage, ToolCallRecord, Attachment } from "@/lib/db";
import { executeToolCall } from "@/lib/tools/executor";
import { generateId } from "@/lib/utils";
import { Part } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId = "default-session",
      message,
      attachments = [],
      apiKey,
      model,
    } = body;

    if (!message && (!attachments || attachments.length === 0)) {
      return new Response(
        JSON.stringify({ error: "메시지 또는 첨부파일이 필요합니다." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const db = getDb();
    
    // Save user message to DB
    const userMessage: ChatMessage = {
      id: generateId(),
      sessionId,
      role: "user",
      content: message || "(첨부파일 전송)",
      attachments: attachments as Attachment[],
      timestamp: new Date().toISOString(),
    };
    db.messages.push(userMessage);

    // Update session updatedAt
    const session = db.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.updatedAt = new Date().toISOString();
      if (session.title === "Junior와의 첫 번째 대화" && message) {
        session.title = message.slice(0, 24) + (message.length > 24 ? "..." : "");
      }
    }
    saveDb(db);

    const generativeModel = getAgentModel(apiKey, model);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, payload: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
          );
        };

        if (!generativeModel) {
          const fallbackText =
            "🔑 **Gemini API 키가 아직 설정되지 않았습니다.**\n\n우측 상단의 **[⚙️ 설정]** 아이콘을 클릭하여 Google AI Studio에서 무료로 발급받으신 Gemini API 키를 입력해 주세요!\n키를 입력하시면 Junior의 실시간 대화, 검색, 도구 연동 기능이 바로 활성화됩니다.";
          
          sendEvent("text", { chunk: fallbackText });
          
          // Save assistant fallback message (re-read latest DB to avoid overwriting concurrent updates)
          const latestDbFallback = getDb();
          latestDbFallback.messages.push({
            id: generateId(),
            sessionId,
            role: "assistant",
            content: fallbackText,
            timestamp: new Date().toISOString(),
          });
          saveDb(latestDbFallback);

          sendEvent("done", { complete: true });
          controller.close();
          return;
        }

        try {
          // Prepare history for Gemini: must strictly alternate user/model and start with user
          const sessionMessages = db.messages
            .filter((m) => m.sessionId === sessionId && m.id !== userMessage.id)
            .slice(-16);

          const contents: { role: string; parts: Part[] }[] = [];
          for (const m of sessionMessages) {
            const role = m.role === "assistant" ? "model" : "user";
            // 1. History must start with 'user'
            if (contents.length === 0 && role !== "user") {
              continue;
            }
            // 2. Avoid consecutive identical roles by merging parts
            const last = contents[contents.length - 1];
            if (last && last.role === role) {
              last.parts.push({ text: m.content });
            } else {
              contents.push({
                role,
                parts: [{ text: m.content }],
              });
            }
          }

          // 3. Ensure history ends with 'model' (or is empty) before appending new user turn
          if (contents.length > 0 && contents[contents.length - 1].role === "user") {
            contents.pop();
          }

          // Prepare user parts (text + attachments if any)
          const userParts: Part[] = [];
          if (message) {
            userParts.push({ text: message });
          }

          if (Array.isArray(attachments)) {
            for (const att of attachments) {
              if (att.dataUrl && att.type) {
                const base64Data = att.dataUrl.split(",")[1] || att.dataUrl;
                userParts.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: att.type,
                  },
                });
              }
            }
          }

          // Append current user message turn
          contents.push({
            role: "user",
            parts: userParts,
          });

          let response = await generativeModel.generateContent({ contents });
          let functionCalls = response.response.functionCalls();
          const recordedToolCalls: ToolCallRecord[] = [];

          // Tool call loop
          let loopCount = 0;
          while (functionCalls && functionCalls.length > 0 && loopCount < 5) {
            loopCount++;

            // Push model's candidate with functionCall into contents
            const candidateContent = response.response.candidates?.[0]?.content;
            if (candidateContent) {
              contents.push(candidateContent);
            }

            const functionResponseParts: Part[] = [];

            for (const call of functionCalls) {
              const callId = generateId();
              sendEvent("tool_start", {
                id: callId,
                name: call.name,
                args: call.args,
              });

              const execution = await executeToolCall(
                call.name,
                call.args as Record<string, unknown>
              );

              recordedToolCalls.push({
                id: callId,
                name: call.name,
                args: call.args as Record<string, unknown>,
                result: execution.result,
              });

              sendEvent("tool_end", {
                id: callId,
                name: call.name,
                result: execution.result,
              });

              functionResponseParts.push({
                functionResponse: {
                  name: call.name,
                  response: { result: execution.result },
                },
              });
            }

            // In Gemini v1beta, functionResponse parts are sent in a 'user' turn
            contents.push({
              role: "user",
              parts: functionResponseParts,
            });

            response = await generativeModel.generateContent({ contents });
            functionCalls = response.response.functionCalls();
          }

          // Final text response
          const finalText = response.response.text();
          sendEvent("text", { chunk: finalText });

          // Save assistant message to DB
          // IMPORTANT: Re-read getDb() here so we DO NOT overwrite memories, todos, schedules,
          // contacts, or drive files that were saved by executeToolCall() during this turn!
          const latestDb = getDb();
          const assistantMessage: ChatMessage = {
            id: generateId(),
            sessionId,
            role: "assistant",
            content: finalText,
            toolCalls: recordedToolCalls.length > 0 ? recordedToolCalls : undefined,
            timestamp: new Date().toISOString(),
          };
          latestDb.messages.push(assistantMessage);
          saveDb(latestDb);

          sendEvent("done", { complete: true, messageId: assistantMessage.id });
        } catch (agentError: unknown) {
          const errStr = agentError instanceof Error ? agentError.message : String(agentError);
          console.error("Gemini Agent Execution Error:", agentError);
          const errorMessage = `⚠️ 응답 생성 중 오류가 발생했습니다: ${errStr}`;
          sendEvent("text", { chunk: errorMessage });

          // Save error message to DB so it persists on screen (re-read latest DB first)
          const latestDbErr = getDb();
          latestDbErr.messages.push({
            id: generateId(),
            sessionId,
            role: "assistant",
            content: errorMessage,
            timestamp: new Date().toISOString(),
          });
          saveDb(latestDbErr);

          sendEvent("done", { complete: true, error: true });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Chat API route error:", error);
    return new Response(
      JSON.stringify({ error: message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
