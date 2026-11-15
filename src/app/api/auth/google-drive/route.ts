import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  getGoogleDriveAuthStatus,
  getGoogleDriveOAuthUrl,
  syncGoogleDriveFiles,
} from "@/lib/googleDrive";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (mode === "authorize") {
    const { url, error } = getGoogleDriveOAuthUrl();
    if (error || !url) {
      return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
    }
    return NextResponse.json({ url });
  }

  return NextResponse.json({
    status: getGoogleDriveAuthStatus(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const prev = db.settings.googleDriveConfig || {};

    if (body.clientId !== undefined || body.clientSecret !== undefined) {
      const clientId = body.clientId ? String(body.clientId).trim() : prev.clientId;
      const clientSecret = body.clientSecret
        ? String(body.clientSecret).trim()
        : prev.clientSecret;

      db.settings.googleDriveConfig = {
        ...prev,
        authMode: "oauth2",
        clientId,
        clientSecret,
      };
      if (clientId) db.settings.googleClientId = clientId;
      if (clientSecret) db.settings.googleClientSecret = clientSecret;
      saveDb(db);
    }

    if (body.serviceAccountJson !== undefined) {
      const rawJson = String(body.serviceAccountJson || "").trim();
      db.settings.googleDriveConfig = {
        ...db.settings.googleDriveConfig,
        authMode: rawJson ? "service_account" : prev.authMode,
        serviceAccountJson: rawJson || undefined,
        connectedAt: rawJson ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      if (rawJson) {
        await syncGoogleDriveFiles();
      }
    }

    if (body.authorize === true) {
      const { url, error } = getGoogleDriveOAuthUrl();
      if (error || !url) {
        return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        authUrl: url,
        status: getGoogleDriveAuthStatus(),
      });
    }

    return NextResponse.json({
      success: true,
      status: getGoogleDriveAuthStatus(),
      message: "Google 드라이브 OAuth / API 인증 설정이 저장되었습니다.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "설정 저장 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  const db = getDb();
  if (db.settings.googleDriveConfig) {
    db.settings.googleDriveConfig = {
      clientId: db.settings.googleDriveConfig.clientId,
      clientSecret: db.settings.googleDriveConfig.clientSecret,
    };
    saveDb(db);
  }
  return NextResponse.json({
    success: true,
    status: getGoogleDriveAuthStatus(),
    message: "Google 드라이브 API 인증 토큰이 연결 해제되었습니다.",
  });
}
