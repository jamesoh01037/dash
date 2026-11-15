import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  getGoogleChatAuthStatus,
  getGoogleChatOAuthUrl,
  listGoogleChatSpaces,
} from "@/lib/googleChat";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (mode === "authorize") {
    const { url, error } = getGoogleChatOAuthUrl();
    if (error || !url) {
      return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
    }
    return NextResponse.json({ url });
  }

  return NextResponse.json({
    status: getGoogleChatAuthStatus(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const prev = db.settings.googleChatConfig || {};

    if (body.clientId !== undefined || body.clientSecret !== undefined) {
      db.settings.googleChatConfig = {
        ...prev,
        authMode: "oauth2",
        clientId: body.clientId ? String(body.clientId).trim() : prev.clientId,
        clientSecret: body.clientSecret ? String(body.clientSecret).trim() : prev.clientSecret,
      };
      // Also mirror into top-level googleClientId/Secret for convenience
      if (body.clientId) db.settings.googleClientId = String(body.clientId).trim();
      if (body.clientSecret) db.settings.googleClientSecret = String(body.clientSecret).trim();
      saveDb(db);
    }

    if (body.serviceAccountJson !== undefined) {
      const rawJson = String(body.serviceAccountJson || "").trim();
      db.settings.googleChatConfig = {
        ...db.settings.googleChatConfig,
        authMode: rawJson ? "service_account" : prev.authMode,
        serviceAccountJson: rawJson || undefined,
        connectedAt: rawJson ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      if (rawJson) {
        await listGoogleChatSpaces(true);
      }
    }

    if (body.authorize === true) {
      const { url, error } = getGoogleChatOAuthUrl();
      if (error || !url) {
        return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        authUrl: url,
        status: getGoogleChatAuthStatus(),
      });
    }

    return NextResponse.json({
      success: true,
      status: getGoogleChatAuthStatus(),
      message: "Google Chat OAuth / 인증 설정이 저장되었습니다.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "설정 저장 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  const db = getDb();
  if (db.settings.googleChatConfig) {
    db.settings.googleChatConfig = {
      clientId: db.settings.googleChatConfig.clientId,
      clientSecret: db.settings.googleChatConfig.clientSecret,
    };
    saveDb(db);
  }
  return NextResponse.json({
    success: true,
    status: getGoogleChatAuthStatus(),
    message: "Google Chat 인증 토큰이 연결 해제되었습니다.",
  });
}
