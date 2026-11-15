import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import { getAgentModel } from "@/lib/gemini";
import { upsertGoogleChatSpace } from "@/lib/googleChat";
import { executeToolCall } from "@/lib/tools/executor";
import { Content, Part } from "@google/generative-ai";

/**
 * Interactive Google Chat App / Bot Webhook Endpoint (`POST /api/google-chat/webhook`).
 * Supports standard Google Chat Workspace Add-on / Chat App event payloads:
 * - type: "ADDED_TO_SPACE" | "MESSAGE" | "CARD_CLICKED" | "REMOVED_FROM_SPACE"
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const eventType: string = body.type || "MESSAGE";
    const spaceName: string =
      body.space?.displayName || body.spaceName || body.space?.name || "Google Chat";
    const spaceId: string | undefined = body.space?.name || body.spaceId;
    const spaceType: string | undefined = body.space?.type || body.space?.spaceType;
    const senderName: string =
      body.user?.displayName || body.message?.sender?.displayName || body.sender || "사용자";
    const rawText: string =
      body.message?.argumentText || body.message?.text || body.text || "";
    const messageName: string | undefined = body.message?.name;
    const threadName: string | undefined = body.message?.thread?.name;

    // 1. Register or update space automatically
    if (spaceName || spaceId) {
      upsertGoogleChatSpace({
        name: spaceName,
        spaceId,
        spaceType,
        description: "Google Chat Bot 웹훅 이벤트 연동 스페이스",
      });
    }

    if (eventType === "ADDED_TO_SPACE") {
      return NextResponse.json({
        text: `안녕하세요! 전담 AI 에이전트 **Junior**가 '${spaceName}' 스페이스에 연결되었습니다. 🚀\n언제든 메시지를 보내주시면 일정 관리, 메일 요약, 웹 검색을 도와드리겠습니다!`,
      });
    }

    if (eventType === "REMOVED_FROM_SPACE") {
      return NextResponse.json({ text: "연결이 해제되었습니다." });
    }

    if (!rawText.trim()) {
      return NextResponse.json({
        text: "안녕하세요! 무엇을 도와드릴까요?",
      });
    }

    // 2. Save incoming message log
    const db = getDb();
    if (!db.googleChatMessages) db.googleChatMessages = [];
    db.googleChatMessages.unshift({
      id: messageName || `gchat-in-${Date.now()}`,
      messageName,
      spaceId: spaceId || spaceName,
      spaceName,
      sender: senderName,
      senderType: "HUMAN",
      text: rawText.trim(),
      direction: "inbound",
      threadName,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);

    // 3. If body.autoReply === false, just acknowledge receipt
    if (body.autoReply === false) {
      return NextResponse.json({ success: true, recorded: true });
    }

    // 4. Generate AI response via Gemini + Junior Tools
    const model = getAgentModel();
    if (!model) {
      return NextResponse.json({
        text: "Junior에 Gemini API 키가 아직 설정되지 않았습니다.",
      });
    }

    const contents: Content[] = [
      {
        role: "user",
        parts: [
          {
            text: `[Google Chat '${spaceName}' 스페이스에서 '${senderName}'님이 보낸 메시지]: ${rawText.trim()}`,
          },
        ],
      },
    ];

    let result = await model.generateContent({ contents });
    let response = result.response;
    let calls = response.functionCalls();

    let loopCount = 0;
    while (calls && calls.length > 0 && loopCount < 3) {
      loopCount++;
      const modelParts = response.candidates?.[0]?.content?.parts || [];
      contents.push({ role: "model", parts: modelParts });

      const toolResponseParts: Part[] = [];
      for (const call of calls) {
        const execResult = await executeToolCall(
          call.name,
          (call.args as Record<string, unknown>) || {}
        );
        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            response: { result: execResult.result },
          },
        });
      }

      contents.push({ role: "user", parts: toolResponseParts });
      result = await model.generateContent({ contents });
      response = result.response;
      calls = response.functionCalls();
    }

    const replyText =
      response.text() || "요청하신 작업을 처리했습니다.";

    // 5. Log Junior's outbound reply
    const freshDb = getDb();
    freshDb.googleChatMessages.unshift({
      id: `gchat-bot-out-${Date.now()}`,
      spaceId: spaceId || spaceName,
      spaceName,
      sender: "Junior (AI Bot)",
      senderType: "BOT",
      text: replyText,
      direction: "outbound",
      threadName,
      createdAt: new Date().toISOString(),
    });
    saveDb(freshDb);

    return NextResponse.json({
      text: replyText,
      ...(threadName ? { thread: { name: threadName } } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook 처리 실패";
    return NextResponse.json(
      { text: `오류가 발생했습니다: ${msg}` },
      { status: 500 }
    );
  }
}
