import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  getGoogleContactsAuthStatus,
  getGoogleContactsOAuthUrl,
  syncGooglePeopleApiContacts,
} from "@/lib/contacts";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (mode === "authorize") {
    const { url, error } = getGoogleContactsOAuthUrl();
    if (error || !url) {
      return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
    }
    return NextResponse.json({ url });
  }

  return NextResponse.json({
    status: getGoogleContactsAuthStatus(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const prev = db.settings.googleContactsConfig || {};

    if (body.clientId !== undefined || body.clientSecret !== undefined) {
      const clientId = body.clientId ? String(body.clientId).trim() : prev.clientId;
      const clientSecret = body.clientSecret ? String(body.clientSecret).trim() : prev.clientSecret;

      db.settings.googleContactsConfig = {
        ...prev,
        authMode: "oauth2",
        clientId,
        clientSecret,
      };
      if (clientId) db.settings.googleClientId = clientId;
      if (clientSecret) db.settings.googleClientSecret = clientSecret;
      saveDb(db);
    }

    if (body.accessToken !== undefined) {
      const token = String(body.accessToken || "").trim();
      db.settings.googleContactsConfig = {
        ...db.settings.googleContactsConfig,
        authMode: token ? "token" : "gmail_imap",
        accessToken: token || undefined,
        connectedAt: token ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      if (token) {
        await syncGooglePeopleApiContacts(true);
      }
    }

    if (body.authorize === true) {
      const { url, error } = getGoogleContactsOAuthUrl();
      if (error || !url) {
        return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        authUrl: url,
        status: getGoogleContactsAuthStatus(),
      });
    }

    return NextResponse.json({
      success: true,
      status: getGoogleContactsAuthStatus(),
      message: "Google 주소록 OAuth / People API 인증 설정이 저장되었습니다.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "설정 저장 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  const db = getDb();
  if (db.settings.googleContactsConfig) {
    db.settings.googleContactsConfig = {
      clientId: db.settings.googleContactsConfig.clientId,
      clientSecret: db.settings.googleContactsConfig.clientSecret,
    };
    saveDb(db);
  }
  return NextResponse.json({
    success: true,
    status: getGoogleContactsAuthStatus(),
    message: "Google 주소록 People API 인증 토큰이 연결 해제되었습니다.",
  });
}
