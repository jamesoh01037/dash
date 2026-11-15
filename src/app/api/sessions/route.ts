import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb, ChatSession } from "@/lib/db";
import { generateId } from "@/lib/utils";

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    sessions: db.sessions || [],
    messages: db.messages || [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const { title } = await req.json().catch(() => ({ title: "새로운 대화" }));
    const db = getDb();

    const newSession: ChatSession = {
      id: generateId(),
      title: title || "새로운 대화",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.sessions = [newSession, ...(db.sessions || [])];
    
    // Add welcome message for new session
    const ownerName = db.settings?.userName || "사용자";
    const welcomeText =
      title && title !== "새로운 대화"
        ? `**「${title}」** 주제로 새로운 대화가 시작되었습니다! ${ownerName}님, 무엇을 도와드릴까요?`
        : `새로운 대화가 시작되었습니다! ${ownerName}님, 무엇을 도와드릴까요?`;

    db.messages.push({
      id: generateId(),
      sessionId: newSession.id,
      role: "assistant",
      content: welcomeText,
      timestamp: new Date().toISOString(),
    });

    saveDb(db);
    return NextResponse.json({ session: newSession }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    const db = getDb();
    db.sessions = (db.sessions || []).filter((s) => s.id !== id);
    db.messages = (db.messages || []).filter((m) => m.sessionId !== id);
    saveDb(db);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
