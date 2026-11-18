import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getDb, saveDb } from "@/lib/db";
import { getOAuthClientCredentials } from "@/lib/auth";

export const dynamic = "force-dynamic";

const UNIFIED_GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  // Gmail
  "https://www.googleapis.com/auth/gmail.modify",
  // Google Drive, Tasks & Calendar
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar",
  // Google Contacts
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/directory.readonly",
  // Google Chat
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
  "https://www.googleapis.com/auth/chat.messages.reactions",
];

export async function GET(req: NextRequest) {
  const { clientId, clientSecret } = getOAuthClientCredentials();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          "Google OAuth Client ID 및 Client Secret이 설정되지 않았습니다. 아래 설정에서 입력해 주세요.",
        needsOAuthSetup: true,
      },
      { status: 400 }
    );
  }

  const origin = req.nextUrl.origin;
  const loginHint = req.nextUrl.searchParams.get("loginHint")?.trim() || undefined;
  const redirectUri = `${origin}/api/auth/login/callback`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    scope: UNIFIED_GOOGLE_SCOPES,
    prompt: "select_account consent",
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  return NextResponse.json({ url, redirectUri });
}

export async function POST(req: NextRequest) {
  try {
    const { clientId, clientSecret } = await req.json();
    if (!clientId?.trim() || !clientSecret?.trim()) {
      return NextResponse.json(
        { error: "Google OAuth Client ID와 Client Secret을 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    const db = getDb();
    db.settings.googleClientId = clientId.trim();
    db.settings.googleClientSecret = clientSecret.trim();
    saveDb(db);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "OAuth 설정 저장 실패" }, { status: 500 });
  }
}
