import crypto from "crypto";
import { getDb } from "./db";

export const SESSION_COOKIE_NAME = "ion_agent_session";

export interface AuthSessionPayload {
  email: string;
  name?: string;
  picture?: string;
  iat: number;
}

function getSigningSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    getOAuthClientCredentials().clientSecret ||
    "ion-collective-personal-agent-secret"
  );
}

export function getOAuthClientCredentials(): {
  clientId?: string;
  clientSecret?: string;
} {
  const db = getDb();
  const s = db.settings || {};
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    s.googleClientId ||
    s.googleDriveConfig?.clientId ||
    s.googleContactsConfig?.clientId ||
    s.googleChatConfig?.clientId;
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET ||
    s.googleClientSecret ||
    s.googleDriveConfig?.clientSecret ||
    s.googleContactsConfig?.clientSecret ||
    s.googleChatConfig?.clientSecret;

  return {
    clientId: clientId?.trim() || undefined,
    clientSecret: clientSecret?.trim() || undefined,
  };
}

export function encodeSessionCookie(payload: AuthSessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function decodeSessionCookie(token?: string | null): AuthSessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac("sha256", getSigningSecret())
      .update(data)
      .digest("base64url");

    if (sig.length !== expectedSig.length) return null;
    const isValid = crypto.timingSafeEqual(
      Buffer.from(sig, "utf8"),
      Buffer.from(expectedSig, "utf8")
    );
    if (!isValid) return null;

    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed?.email) return null;
    return parsed as AuthSessionPayload;
  } catch {
    return null;
  }
}
