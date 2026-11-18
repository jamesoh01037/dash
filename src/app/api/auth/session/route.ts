import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  decodeSessionCookie,
  getOAuthClientCredentials,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { getValidGoogleDriveToken } from "@/lib/googleDrive";
import { fetchGoogleUserOrganization } from "@/lib/googleOrg";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = decodeSessionCookie(token);
  const db = getDb();
  const { clientId, clientSecret } = getOAuthClientCredentials();

  // Lazily resolve organization name for already signed-in Workspace users
  if (session?.email && !db.settings.authUserOrg) {
    try {
      const accessToken = await getValidGoogleDriveToken();
      if (accessToken) {
        const org = await fetchGoogleUserOrganization({
          accessToken,
          email: session.email,
        });
        if (org) {
          db.settings.authUserOrg = org;
          saveDb(db);
        }
      }
    } catch {
      // silent
    }
  }

  return NextResponse.json({
    authenticated: Boolean(session),
    user: session
      ? {
          email: session.email,
          googleName: session.name,
          picture: session.picture,
        }
      : null,
    userName: db.settings.userName || session?.name || "사용자",
    userOrg: db.settings.authUserOrg || null,
    assistantName: db.settings.assistantName || "Junior",
    onboardingCompleted: Boolean(db.settings.onboardingCompleted),
    hasOAuthConfig: Boolean(clientId && clientSecret),
    oauthClientIdPrefix: clientId ? `${clientId.slice(0, 18)}...` : null,
    model: db.settings.model || "gemini-3.8-flash",
  });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
