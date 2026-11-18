import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import { decodeSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = decodeSessionCookie(token);
  if (!session) {
    return NextResponse.json({ error: "Google 로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { userName, assistantName } = await req.json();
    const cleanUserName = String(userName || "").trim();
    const cleanAssistantName = String(assistantName || "").trim();

    if (!cleanUserName || !cleanAssistantName) {
      return NextResponse.json(
        { error: "당신의 이름과 AI 비서의 이름을 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    const db = getDb();
    db.settings.userName = cleanUserName;
    db.settings.assistantName = cleanAssistantName;
    db.settings.onboardingCompleted = true;

    // Update default initial memory/welcome message if they still hold placeholder text
    if (Array.isArray(db.memories)) {
      const mem1 = db.memories.find((m) => m.id === "mem-1");
      if (mem1) {
        mem1.content = `사용자의 이름은 ${cleanUserName}이며, AI 비서의 이름은 ${cleanAssistantName}입니다.`;
      }
    }

    saveDb(db);

    return NextResponse.json({
      success: true,
      userName: cleanUserName,
      assistantName: cleanAssistantName,
      onboardingCompleted: true,
    });
  } catch {
    return NextResponse.json({ error: "온보딩 정보 저장 실패" }, { status: 500 });
  }
}
