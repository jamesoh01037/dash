import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getDb, saveDb } from "@/lib/db";
import {
  encodeSessionCookie,
  getOAuthClientCredentials,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { fetchGoogleUserOrganization } from "@/lib/googleOrg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(oauthError)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent("Google 인증 코드가 없습니다.")}`
    );
  }

  const { clientId, clientSecret } = getOAuthClientCredentials();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent("Google OAuth 설정이 누락되었습니다.")}`
    );
  }

  try {
    const redirectUri = `${origin}/api/auth/login/callback`;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) {
      return NextResponse.redirect(
        `${origin}/?auth_error=${encodeURIComponent("Google 계정 이메일 정보를 가져오지 못했습니다.")}`
      );
    }

    const db = getDb();
    const prevEmail = db.settings.authUserEmail;

    // If a different Google user logs in for the first time, trigger onboarding again
    if (prevEmail && prevEmail.toLowerCase() !== userInfo.email.toLowerCase()) {
      db.settings.onboardingCompleted = false;
    }

    const nowIso = new Date().toISOString();
    const accessToken = tokens.access_token || undefined;
    const expiryDate = tokens.expiry_date || undefined;

    db.settings.authUserEmail = userInfo.email;
    db.settings.authUserName = userInfo.name || undefined;
    db.settings.authUserPicture = userInfo.picture || undefined;
    db.settings.authUserOrg = accessToken
      ? await fetchGoogleUserOrganization({
          accessToken,
          email: userInfo.email,
          hostedDomain: userInfo.hd,
        })
      : userInfo.hd || undefined;
    db.settings.googleClientId = clientId;
    db.settings.googleClientSecret = clientSecret;

    // Auto-configure all Google services (Gmail, Contacts, Google Chat, Google Drive)
    // using the single unified Google login so the user never has to enter keys per service.
    if (accessToken) {
      db.settings.gmailTokens = {
        accessToken,
        refreshToken: tokens.refresh_token || db.settings.gmailTokens?.refreshToken,
        expiryDate,
        email: userInfo.email,
        connectedAt: nowIso,
      };

      db.settings.googleContactsConfig = {
        ...(db.settings.googleContactsConfig || {}),
        authMode: "oauth2",
        clientId,
        clientSecret,
        accessToken,
        refreshToken:
          tokens.refresh_token || db.settings.googleContactsConfig?.refreshToken,
        expiryDate,
        connectedEmail: userInfo.email,
        connectedAt: nowIso,
      };

      db.settings.googleChatConfig = {
        ...(db.settings.googleChatConfig || {}),
        authMode: "oauth2",
        clientId,
        clientSecret,
        accessToken,
        refreshToken:
          tokens.refresh_token || db.settings.googleChatConfig?.refreshToken,
        expiryDate,
        connectedEmail: userInfo.email,
        connectedAt: nowIso,
      };

      db.settings.googleDriveConfig = {
        ...(db.settings.googleDriveConfig || {}),
        authMode: "oauth2",
        clientId,
        clientSecret,
        accessToken,
        refreshToken:
          tokens.refresh_token || db.settings.googleDriveConfig?.refreshToken,
        expiryDate,
        connectedEmail: userInfo.email,
        connectedAt: nowIso,
      };
    }

    saveDb(db);

    const sessionToken = encodeSessionCookie({
      email: userInfo.email,
      name: userInfo.name || undefined,
      picture: userInfo.picture || undefined,
      iat: Date.now(),
    });

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google 로그인 처리 실패";
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(message)}`
    );
  }
}
