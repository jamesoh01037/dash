import crypto from "crypto";
import {
  getDb,
  saveDb,
  GoogleChatSpace,
  GoogleChatMessageLog,
  GoogleChatMember,
  GoogleChatConfig,
} from "./db";
import { getGmailCredentials, listGmailMessages } from "./gmail";

const CHAT_API_BASE = "https://chat.googleapis.com/v1";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_CHAT_SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
  "https://www.googleapis.com/auth/chat.messages.reactions",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

/**
 * Extracts `spaces/XXXX` from a Google Chat Webhook URL or raw space ID.
 */
export function extractSpaceId(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const match = trimmed.match(/spaces\/([A-Za-z0-9_-]+)/);
  if (match) {
    return `spaces/${match[1]}`;
  }
  return undefined;
}

/**
 * Returns the OAuth 2.0 Client ID and Secret from GoogleChatConfig, AppSettings, or Env.
 */
export function getGoogleChatOAuthCredentials(): {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
} {
  const db = getDb();
  const clientId =
    db.settings.googleChatConfig?.clientId ||
    db.settings.googleClientId ||
    process.env.GOOGLE_CHAT_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    db.settings.googleChatConfig?.clientSecret ||
    db.settings.googleClientSecret ||
    process.env.GOOGLE_CHAT_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/google-chat/callback`;

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generates the Google OAuth 2.0 Authorization URL for full Google Chat API access.
 */
export function getGoogleChatOAuthUrl(): { url?: string; error?: string } {
  const { clientId, redirectUri } = getGoogleChatOAuthCredentials();
  if (!clientId) {
    return {
      error:
        "Google OAuth Client ID가 설정되어 있지 않습니다. [OAuth 2.0 / 인증 설정] 모달에서 Client ID와 Client Secret을 먼저 입력해 주세요.",
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CHAT_SCOPES.join(" "),
  });

  return { url: `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}` };
}

/**
 * Exchanges an OAuth 2.0 authorization code for access_token and refresh_token.
 */
export async function exchangeGoogleChatCodeForTokens(code: string): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleChatOAuthCredentials();
  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: "Google OAuth Client ID 또는 Client Secret이 누락되었습니다.",
    };
  }

  try {
    const tokenRes = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      return {
        success: false,
        error: `OAuth 토큰 교환 실패 (${tokenRes.status}): ${errBody.slice(0, 180)}`,
      };
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    let email: string | undefined;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        const userInfo = (await userRes.json()) as { email?: string };
        email = userInfo.email;
      }
    } catch {
      // ignore userinfo failure
    }

    const db = getDb();
    const prev = db.settings.googleChatConfig || {};
    const updated: GoogleChatConfig = {
      ...prev,
      authMode: "oauth2",
      clientId,
      clientSecret,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || prev.refreshToken,
      expiryDate: Date.now() + (tokenData.expires_in || 3599) * 1000,
      connectedEmail: email || prev.connectedEmail,
      connectedAt: new Date().toISOString(),
    };

    db.settings.googleChatConfig = updated;
    saveDb(db);

    return { success: true, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth 통신 오류";
    return { success: false, error: msg };
  }
}

/**
 * Signs a JWT with a Google Cloud Service Account JSON key to obtain an access token for Google Chat Bot API.
 */
async function getServiceAccountAccessToken(serviceAccountRaw: string): Promise<string | null> {
  try {
    const sa = JSON.parse(serviceAccountRaw) as {
      client_email?: string;
      private_key?: string;
      token_uri?: string;
    };
    if (!sa.client_email || !sa.private_key) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claimSet = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/chat.bot https://www.googleapis.com/auth/chat.spaces https://www.googleapis.com/auth/chat.messages",
      aud: sa.token_uri || GOOGLE_OAUTH_TOKEN_URL,
      exp: nowSec + 3600,
      iat: nowSec,
    };

    const base64UrlEncode = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const unsignedJwt = `${base64UrlEncode(header)}.${base64UrlEncode(claimSet)}`;
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsignedJwt);
    signer.end();

    const signature = signer
      .sign(sa.private_key, "base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const assertion = `${unsignedJwt}.${signature}`;

    const res = await fetch(sa.token_uri || GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    const db = getDb();
    db.settings.googleChatConfig = {
      ...(db.settings.googleChatConfig || {}),
      authMode: "service_account",
      accessToken: data.access_token,
      expiryDate: Date.now() + (data.expires_in || 3599) * 1000,
      connectedEmail: sa.client_email,
    };
    saveDb(db);

    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Returns a valid Google Chat REST API v1 Bearer token, automatically refreshing via OAuth2 refresh_token or Service Account JWT if expired.
 */
export async function getValidGoogleChatToken(): Promise<string | null> {
  const db = getDb();
  const cfg = db.settings.googleChatConfig;

  const isExpired = cfg?.expiryDate ? Date.now() > cfg.expiryDate - 60_000 : false;

  // 1. Valid cached token
  if (cfg?.accessToken && !isExpired) {
    return cfg.accessToken;
  }

  // 2. Refresh via OAuth 2.0 refresh_token
  if (cfg?.refreshToken) {
    const { clientId, clientSecret } = getGoogleChatOAuthCredentials();
    if (clientId && clientSecret) {
      try {
        const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: cfg.refreshToken,
            grant_type: "refresh_token",
          }).toString(),
        });

        if (res.ok) {
          const data = (await res.json()) as { access_token: string; expires_in?: number };
          if (data.access_token) {
            db.settings.googleChatConfig = {
              ...cfg,
              accessToken: data.access_token,
              expiryDate: Date.now() + (data.expires_in || 3599) * 1000,
            };
            saveDb(db);
            return data.access_token;
          }
        }
      } catch {
        // fallback below
      }
    }
  }

  // 3. Refresh via Service Account JSON key
  if (cfg?.serviceAccountJson) {
    const saToken = await getServiceAccountAccessToken(cfg.serviceAccountJson);
    if (saToken) return saToken;
  }

  // 4. Fallback to raw token or environment variable
  return cfg?.accessToken || process.env.GOOGLE_CHAT_ACCESS_TOKEN || null;
}

/**
 * Returns connection summary for the Google Chat Hub UI.
 */
export function getGoogleChatAuthStatus() {
  const db = getDb();
  const cfg = db.settings.googleChatConfig;
  const { clientId, redirectUri } = getGoogleChatOAuthCredentials();
  const hasToken = Boolean(
    cfg?.accessToken || cfg?.refreshToken || cfg?.serviceAccountJson || process.env.GOOGLE_CHAT_ACCESS_TOKEN
  );

  return {
    authMode: cfg?.authMode || (hasToken ? "token" : "webhook"),
    hasAccessToken: hasToken,
    hasOAuthClient: Boolean(clientId),
    hasRefreshToken: Boolean(cfg?.refreshToken),
    hasServiceAccount: Boolean(cfg?.serviceAccountJson),
    connectedEmail: cfg?.connectedEmail,
    connectedAt: cfg?.connectedAt,
    redirectUri,
  };
}

/**
 * Lists locally registered Google Chat spaces and synchronizes with Google Chat REST API v1 (`GET /v1/spaces`).
 */
export async function listGoogleChatSpaces(syncRemote = false): Promise<{
  spaces: GoogleChatSpace[];
  remoteError?: string;
}> {
  const db = getDb();
  const spaces = [...(db.googleChatSpaces || [])];
  const token = await getValidGoogleChatToken();

  if (syncRemote && token) {
    try {
      const res = await fetch(`${CHAT_API_BASE}/spaces?pageSize=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          spaces?: Array<{
            name: string;
            displayName?: string;
            spaceType?: string;
            singleUserBotDm?: boolean;
            spaceDetails?: { description?: string };
          }>;
        };
        if (data.spaces && data.spaces.length > 0) {
          let changed = false;
          for (const remote of data.spaces) {
            const existingIdx = spaces.findIndex(
              (s) =>
                s.spaceId === remote.name ||
                (remote.displayName && s.name.toLowerCase() === remote.displayName.toLowerCase())
            );
            const friendlyName =
              remote.displayName ||
              (remote.spaceType === "DIRECT_MESSAGE"
                ? `1:1 DM (${remote.name.replace("spaces/", "")})`
                : remote.name);

            if (existingIdx === -1) {
              const newSpace: GoogleChatSpace = {
                id: `gchat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: friendlyName,
                spaceId: remote.name,
                spaceType: remote.spaceType || "SPACE",
                description:
                  remote.spaceDetails?.description ||
                  `Google Chat API 동기화 (${remote.spaceType || "SPACE"})`,
                createdAt: new Date().toISOString(),
              };
              spaces.push(newSpace);
              db.googleChatSpaces.push(newSpace);
              changed = true;
            } else {
              // Enrich existing space metadata
              const existing = spaces[existingIdx];
              if (!existing.spaceId) {
                existing.spaceId = remote.name;
                existing.spaceType = remote.spaceType || existing.spaceType;
                changed = true;
              }
            }
          }
          if (changed) {
            saveDb(db);
          }
        }
      } else {
        const errText = await res.text();
        return {
          spaces,
          remoteError: `Google Chat API 조회 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "네트워크 오류";
      return { spaces, remoteError: msg };
    }
  }

  return { spaces };
}

/**
 * Creates a new Google Chat Space via `POST /v1/spaces:setup` (or `/v1/spaces`) using OAuth 2.0 user credentials.
 */
export async function createGoogleChatSpace(params: {
  displayName: string;
  description?: string;
  memberEmails?: string[];
}): Promise<{
  success: boolean;
  space?: GoogleChatSpace;
  error?: string;
}> {
  const token = await getValidGoogleChatToken();
  if (!token) {
    return {
      success: false,
      error:
        "새 Google Chat 스페이스를 생성하려면 OAuth 2.0 연동 또는 REST API 액세스 토큰이 필요합니다.",
    };
  }

  try {
    const memberships = (params.memberEmails || [])
      .map((e) => e.trim())
      .filter(Boolean)
      .map((email) => ({
        member: {
          name: `users/${email}`,
          type: "HUMAN",
        },
      }));

    const setupPayload: Record<string, unknown> = {
      space: {
        spaceType: "SPACE",
        displayName: params.displayName.trim(),
        ...(params.description
          ? { spaceDetails: { description: params.description.trim() } }
          : {}),
      },
      ...(memberships.length > 0 ? { memberships } : {}),
    };

    const res = await fetch(`${CHAT_API_BASE}/spaces:setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(setupPayload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return {
        success: false,
        error: `Google Chat 스페이스 생성 실패 (HTTP ${res.status}): ${errBody.slice(0, 160)}`,
      };
    }

    const createdRemote = (await res.json()) as {
      name: string;
      displayName?: string;
      spaceType?: string;
    };

    const saved = upsertGoogleChatSpace({
      name: createdRemote.displayName || params.displayName.trim(),
      spaceId: createdRemote.name,
      spaceType: createdRemote.spaceType || "SPACE",
      description: params.description || "Junior에서 생성한 Google Chat 스페이스",
    });

    return {
      success: true,
      space: saved,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "스페이스 생성 중 오류가 발생했습니다.",
    };
  }
}

/**
 * Finds or creates a 1:1 Direct Message space with a user email via Google Chat API.
 */
export async function findOrCreateGoogleChatDmSpace(params: {
  email: string;
  displayName?: string;
}): Promise<{
  success: boolean;
  space?: GoogleChatSpace;
  error?: string;
}> {
  const cleanEmail = params.email.trim();
  if (!cleanEmail) {
    return { success: false, error: "상대방 이메일이 필요합니다." };
  }

  const token = await getValidGoogleChatToken();
  if (!token) {
    return {
      success: false,
      error: "Google Chat OAuth 2.0 연동이 필요합니다.",
    };
  }

  try {
    // 1. Try findDirectMessage first
    const findUrl = new URL(`${CHAT_API_BASE}/spaces:findDirectMessage`);
    findUrl.searchParams.set("name", `users/${cleanEmail}`);
    const findRes = await fetch(findUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (findRes.ok) {
      const dmSpace = (await findRes.json()) as {
        name: string;
        displayName?: string;
        spaceType?: string;
      };
      const saved = upsertGoogleChatSpace({
        name: params.displayName || dmSpace.displayName || cleanEmail,
        spaceId: dmSpace.name,
        spaceType: dmSpace.spaceType || "DIRECT_MESSAGE",
        description: `1:1 DM (${cleanEmail})`,
      });
      return { success: true, space: saved };
    }

    // 2. Otherwise setup a new DM space
    const setupRes = await fetch(`${CHAT_API_BASE}/spaces:setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        space: { spaceType: "DIRECT_MESSAGE" },
        memberships: [
          {
            member: {
              name: `users/${cleanEmail}`,
              type: "HUMAN",
            },
          },
        ],
      }),
    });

    if (!setupRes.ok) {
      const errText = await setupRes.text();
      return {
        success: false,
        error: `DM 스페이스 연결 실패 (HTTP ${setupRes.status}): ${errText.slice(0, 150)}`,
      };
    }

    const createdDm = (await setupRes.json()) as {
      name: string;
      displayName?: string;
      spaceType?: string;
    };
    const saved = upsertGoogleChatSpace({
      name: params.displayName || createdDm.displayName || cleanEmail,
      spaceId: createdDm.name,
      spaceType: createdDm.spaceType || "DIRECT_MESSAGE",
      description: `1:1 DM (${cleanEmail})`,
    });
    return { success: true, space: saved };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "DM 스페이스 조회 중 오류",
    };
  }
}

/**
 * Lists members of a Google Chat Space via `GET /v1/{parent=spaces/*}/members`.
 */
export async function listGoogleChatMembers(spaceNameOrId?: string): Promise<{
  success: boolean;
  space?: GoogleChatSpace;
  members: GoogleChatMember[];
  error?: string;
}> {
  const space = resolveGoogleChatSpace(spaceNameOrId);
  if (!space || !space.spaceId) {
    return {
      success: false,
      members: [],
      error: "멤버를 조회할 대상 스페이스의 Space ID(spaces/...)가 없습니다.",
    };
  }

  const token = await getValidGoogleChatToken();
  if (!token) {
    return {
      success: false,
      space,
      members: [],
      error: "스페이스 멤버 목록을 조회하려면 Google Chat OAuth 2.0 또는 REST API 토큰이 필요합니다.",
    };
  }

  const normalizedSpace = space.spaceId.startsWith("spaces/")
    ? space.spaceId
    : `spaces/${space.spaceId}`;

  try {
    const res = await fetch(`${CHAT_API_BASE}/${normalizedSpace}/members?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        space,
        members: [],
        error: `멤버 조회 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
      };
    }

    const data = (await res.json()) as {
      memberships?: Array<{
        name: string;
        role?: string;
        member?: {
          name?: string;
          displayName?: string;
          type?: string;
        };
      }>;
    };

    const members: GoogleChatMember[] = (data.memberships || []).map((m) => ({
      name: m.name,
      displayName: m.member?.displayName || m.member?.name || "참여자",
      role: m.role || "ROLE_MEMBER",
      type: m.member?.type || "HUMAN",
    }));

    return {
      success: true,
      space,
      members,
    };
  } catch (err) {
    return {
      success: false,
      space,
      members: [],
      error: err instanceof Error ? err.message : "멤버 조회 오류",
    };
  }
}

/**
 * Registers or updates a Google Chat Space (Webhook URL and/or Space ID).
 */
export function upsertGoogleChatSpace(input: {
  name: string;
  webhookUrl?: string;
  spaceId?: string;
  spaceType?: string;
  description?: string;
}): GoogleChatSpace {
  const db = getDb();
  if (!db.googleChatSpaces) db.googleChatSpaces = [];

  const cleanName = input.name.trim();
  const cleanWebhook = input.webhookUrl?.trim() || undefined;
  const derivedSpaceId = input.spaceId?.trim() || extractSpaceId(cleanWebhook);

  const existingIdx = db.googleChatSpaces.findIndex(
    (s) =>
      s.name.toLowerCase() === cleanName.toLowerCase() ||
      (cleanWebhook && s.webhookUrl === cleanWebhook) ||
      (derivedSpaceId && s.spaceId === derivedSpaceId)
  );

  if (existingIdx >= 0) {
    const current = db.googleChatSpaces[existingIdx];
    const updated: GoogleChatSpace = {
      ...current,
      name: cleanName || current.name,
      webhookUrl: cleanWebhook || current.webhookUrl,
      spaceId: derivedSpaceId || current.spaceId,
      spaceType: input.spaceType || current.spaceType || "SPACE",
      description:
        input.description !== undefined ? input.description.trim() : current.description,
    };
    db.googleChatSpaces[existingIdx] = updated;
    saveDb(db);
    return updated;
  }

  const created: GoogleChatSpace = {
    id: `gchat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    webhookUrl: cleanWebhook,
    spaceId: derivedSpaceId,
    spaceType: input.spaceType || "SPACE",
    description: input.description?.trim(),
    createdAt: new Date().toISOString(),
  };

  db.googleChatSpaces.unshift(created);
  saveDb(db);
  return created;
}

/**
 * Deletes a registered Google Chat space by ID or name.
 */
export function deleteGoogleChatSpace(idOrName: string): GoogleChatSpace | null {
  const db = getDb();
  if (!db.googleChatSpaces) return null;

  const q = idOrName.trim().toLowerCase();
  const idx = db.googleChatSpaces.findIndex(
    (s) =>
      s.id === idOrName ||
      s.name.toLowerCase() === q ||
      (s.spaceId && s.spaceId.toLowerCase() === q)
  );

  if (idx === -1) return null;
  const [removed] = db.googleChatSpaces.splice(idx, 1);
  saveDb(db);
  return removed;
}

/**
 * Finds a target space by name, ID, or spaceId, or falls back to the first available space.
 */
export function resolveGoogleChatSpace(spaceNameOrId?: string): GoogleChatSpace | null {
  const db = getDb();
  const spaces = db.googleChatSpaces || [];
  if (spaces.length === 0) return null;

  if (!spaceNameOrId || !spaceNameOrId.trim()) {
    return spaces[0];
  }

  const q = spaceNameOrId.trim().toLowerCase();
  return (
    spaces.find(
      (s) =>
        s.id.toLowerCase() === q ||
        s.name.toLowerCase() === q ||
        (s.spaceId && s.spaceId.toLowerCase() === q) ||
        s.name.toLowerCase().includes(q)
    ) || spaces[0]
  );
}

/**
 * Sends a message (plain text, Cards v2 with optional action buttons, or thread reply) to a Google Chat Space.
 */
export async function sendGoogleChatMessage(params: {
  spaceNameOrId?: string;
  text: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonUrl?: string;
  threadName?: string;
  threadKey?: string;
  useCard?: boolean;
}): Promise<{
  success: boolean;
  space?: GoogleChatSpace;
  messageLog?: GoogleChatMessageLog;
  error?: string;
}> {
  const db = getDb();
  const space = resolveGoogleChatSpace(params.spaceNameOrId);

  if (!space) {
    return {
      success: false,
      error:
        "등록된 Google Chat 스페이스(채팅방)가 없습니다. 좌측 [💬 Google Chat] 탭에서 OAuth 2.0 연동 또는 스페이스 웹훅을 먼저 등록해 주세요.",
    };
  }

  const token = await getValidGoogleChatToken();

  // Build Google Chat API payload
  const payload: Record<string, unknown> = {
    text: params.text,
  };

  if (params.threadName) {
    payload.thread = { name: params.threadName };
  }

  if (params.useCard || params.title || params.buttonUrl) {
    const widgets: Array<Record<string, unknown>> = [
      {
        textParagraph: {
          text: params.text,
        },
      },
    ];

    if (params.buttonUrl) {
      widgets.push({
        buttonList: {
          buttons: [
            {
              text: params.buttonText || "🔗 자세히 보기",
              onClick: {
                openLink: {
                  url: params.buttonUrl,
                },
              },
            },
          ],
        },
      });
    }

    payload.cardsV2 = [
      {
        cardId: `junior-card-${Date.now()}`,
        card: {
          header: {
            title: params.title || "🤖 Junior AI 브리핑",
            subtitle:
              params.subtitle || `${db.settings.userName || "사용자"}님의 전담 에이전트 알림`,
          },
          sections: [
            {
              widgets,
            },
          ],
        },
      },
    ];
  }

  try {
    let responseOk = false;
    let errorDetail = "";
    let createdMessageName: string | undefined;
    let createdThreadName: string | undefined;

    // Priority 1: Google Chat REST API v1 (when Space ID + valid OAuth/ServiceAccount Token exist)
    if (space.spaceId && token) {
      const normalizedSpace = space.spaceId.startsWith("spaces/")
        ? space.spaceId
        : `spaces/${space.spaceId}`;
      const apiUrl = new URL(`${CHAT_API_BASE}/${normalizedSpace}/messages`);
      if (params.threadKey) {
        apiUrl.searchParams.set("threadKey", params.threadKey);
        apiUrl.searchParams.set(
          "messageReplyOption",
          "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"
        );
      } else if (params.threadName) {
        apiUrl.searchParams.set(
          "messageReplyOption",
          "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"
        );
      }

      const res = await fetch(apiUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        responseOk = true;
        const respJson = (await res.json()) as {
          name?: string;
          thread?: { name?: string };
        };
        createdMessageName = respJson.name;
        createdThreadName = respJson.thread?.name;
      } else {
        const errBody = await res.text();
        errorDetail = `Google Chat API 전송 실패 (HTTP ${res.status}): ${errBody.slice(0, 150)}`;
      }
    }

    // Priority 2: Incoming Webhook URL (fallback or standalone webhook mode)
    if (!responseOk && space.webhookUrl) {
      const url = new URL(space.webhookUrl);
      if (params.threadKey) {
        url.searchParams.set("threadKey", params.threadKey);
        url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
      }

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        responseOk = true;
        try {
          const respJson = (await res.json()) as {
            name?: string;
            thread?: { name?: string };
          };
          createdMessageName = respJson.name;
          createdThreadName = respJson.thread?.name;
        } catch {
          // ignore
        }
      } else {
        const errBody = await res.text();
        errorDetail = `웹훅 전송 실패 (HTTP ${res.status}): ${errBody.slice(0, 150)}`;
      }
    }

    if (!responseOk) {
      return {
        success: false,
        space,
        error:
          errorDetail ||
          `'${space.name}' 스페이스에 유효한 OAuth 토큰 또는 웹훅 URL이 설정되어 있지 않습니다.`,
      };
    }

    const logItem: GoogleChatMessageLog = {
      id: createdMessageName || `gchat-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      messageName: createdMessageName,
      spaceId: space.spaceId || space.id,
      spaceName: space.name,
      sender: "Junior (AI Agent)",
      senderType: "BOT",
      text: params.title ? `[${params.title}] ${params.text}` : params.text,
      direction: "outbound",
      threadName: createdThreadName || params.threadName,
      threadKey: params.threadKey,
      createdAt: new Date().toISOString(),
    };

    const freshDb = getDb();
    if (!freshDb.googleChatMessages) freshDb.googleChatMessages = [];
    freshDb.googleChatMessages.unshift(logItem);
    if (freshDb.googleChatMessages.length > 250) {
      freshDb.googleChatMessages = freshDb.googleChatMessages.slice(0, 250);
    }
    saveDb(freshDb);

    return {
      success: true,
      space,
      messageLog: logItem,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    return {
      success: false,
      space,
      error: `Google Chat 통신 중 오류가 발생했습니다: ${msg}`,
    };
  }
}

/**
 * Updates an existing Google Chat message (`PATCH /v1/{name=spaces/* /messages/*}?updateMask=text`).
 */
export async function updateGoogleChatMessage(params: {
  messageName: string;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const token = await getValidGoogleChatToken();
  if (!token) {
    return {
      success: false,
      error: "메시지를 수정하려면 Google Chat OAuth 2.0 또는 REST API 토큰이 필요합니다.",
    };
  }

  try {
    const res = await fetch(
      `${CHAT_API_BASE}/${params.messageName}?updateMask=text`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: params.text }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `메시지 수정 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
      };
    }

    const db = getDb();
    const target = db.googleChatMessages?.find(
      (m) => m.messageName === params.messageName || m.id === params.messageName
    );
    if (target) {
      target.text = params.text;
      saveDb(db);
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "메시지 수정 중 오류 발생",
    };
  }
}

/**
 * Deletes a Google Chat message (`DELETE /v1/{name=spaces/* /messages/*}`).
 */
export async function deleteGoogleChatMessage(
  messageName: string
): Promise<{ success: boolean; error?: string }> {
  const token = await getValidGoogleChatToken();
  const db = getDb();

  if (token && messageName.startsWith("spaces/")) {
    try {
      const res = await fetch(`${CHAT_API_BASE}/${messageName}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: `Google Chat API 메시지 삭제 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "메시지 삭제 중 오류 발생",
      };
    }
  }

  if (db.googleChatMessages) {
    db.googleChatMessages = db.googleChatMessages.filter(
      (m) => m.id !== messageName && m.messageName !== messageName
    );
    saveDb(db);
  }

  return { success: true };
}

/**
 * Adds a unicode emoji reaction to a Google Chat message (`POST /v1/{parent=spaces/* /messages/*}/reactions`).
 */
export async function addGoogleChatReaction(params: {
  messageName: string;
  emoji: string;
}): Promise<{ success: boolean; error?: string }> {
  const token = await getValidGoogleChatToken();
  const db = getDb();

  if (token && params.messageName.startsWith("spaces/")) {
    try {
      const res = await fetch(`${CHAT_API_BASE}/${params.messageName}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          emoji: { unicode: params.emoji },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: `리액션 추가 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "리액션 추가 중 오류 발생",
      };
    }
  }

  const target = db.googleChatMessages?.find(
    (m) => m.messageName === params.messageName || m.id === params.messageName
  );
  if (target) {
    if (!target.reactions) target.reactions = [];
    if (!target.reactions.includes(params.emoji)) {
      target.reactions.push(params.emoji);
    }
    saveDb(db);
  }

  return { success: true };
}

/**
 * Fetches recent Google Chat messages from:
 * 1) Google Chat REST API v1 (`GET /v1/spaces/{space}/messages?orderBy=createTime desc`)
 * 2) Gmail Chat notifications if syncFromGmail is enabled
 * 3) Local message history (`db.googleChatMessages`)
 */
export async function getGoogleChatMessages(params?: {
  spaceNameOrId?: string;
  maxResults?: number;
  filter?: string;
  syncFromGmail?: boolean;
}): Promise<{
  messages: GoogleChatMessageLog[];
  syncedCount: number;
  apiMessage?: string;
  spaceName?: string;
}> {
  const db = getDb();
  if (!db.googleChatMessages) db.googleChatMessages = [];

  const maxResults = Math.min(Math.max(params?.maxResults || 20, 1), 100);
  const space = resolveGoogleChatSpace(params?.spaceNameOrId);
  const token = await getValidGoogleChatToken();

  let syncedCount = 0;
  let apiMessage: string | undefined;

  // 1. Try Google Chat REST API v1 if token and spaceId exist
  if (token && space?.spaceId) {
    try {
      const normalizedSpace = space.spaceId.startsWith("spaces/")
        ? space.spaceId
        : `spaces/${space.spaceId}`;
      const queryParams = new URLSearchParams({
        pageSize: String(maxResults),
        orderBy: "createTime desc",
      });
      if (params?.filter) {
        queryParams.set("filter", params.filter);
      }

      const res = await fetch(
        `${CHAT_API_BASE}/${normalizedSpace}/messages?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          messages?: Array<{
            name: string;
            text?: string;
            createTime?: string;
            thread?: { name?: string };
            sender?: { displayName?: string; name?: string; type?: "HUMAN" | "BOT" };
            emojiReactionSummaries?: Array<{ emoji?: { unicode?: string } }>;
          }>;
        };
        if (data.messages && data.messages.length > 0) {
          for (const m of data.messages) {
            if (!m.text) continue;
            const existing = db.googleChatMessages.find(
              (log) => log.id === m.name || log.messageName === m.name
            );
            const reactions = (m.emojiReactionSummaries || [])
              .map((r) => r.emoji?.unicode)
              .filter((u): u is string => Boolean(u));

            if (!existing) {
              db.googleChatMessages.unshift({
                id: m.name,
                messageName: m.name,
                spaceId: normalizedSpace,
                spaceName: space.name,
                sender: m.sender?.displayName || m.sender?.name || "Google Chat 사용자",
                senderType: m.sender?.type || "HUMAN",
                text: m.text,
                direction: m.sender?.type === "BOT" ? "outbound" : "inbound",
                threadName: m.thread?.name,
                reactions: reactions.length > 0 ? reactions : undefined,
                createdAt: m.createTime || new Date().toISOString(),
              });
              syncedCount++;
            } else {
              existing.text = m.text;
              if (reactions.length > 0) existing.reactions = reactions;
            }
          }
          saveDb(db);
        }
      } else {
        apiMessage = `Google Chat REST API 응답 상태: HTTP ${res.status}`;
      }
    } catch (err) {
      apiMessage = err instanceof Error ? err.message : "Google Chat API 호출 오류";
    }
  }

  // 2. Optionally sync Google Chat notifications via connected Gmail IMAP
  const { email, appPassword } = getGmailCredentials();
  if (params?.syncFromGmail && email && appPassword) {
    try {
      const gmailRes = await listGmailMessages("all", 10);
      const chatEmails = gmailRes.messages || [];
      for (const mail of chatEmails) {
        const isChatMail =
          mail.from.toLowerCase().includes("chat") ||
          mail.subject.toLowerCase().includes("chat") ||
          mail.subject.includes("채팅");
        if (!isChatMail) continue;

        const logId = `gmail-chat-${mail.id}`;
        const exists = db.googleChatMessages.some((log) => log.id === logId);
        if (!exists) {
          db.googleChatMessages.unshift({
            id: logId,
            spaceId: "gmail-chat-bridge",
            spaceName: "Gmail Google Chat 알림",
            sender: mail.from,
            senderType: "HUMAN",
            text: `${mail.subject} — ${mail.snippet}`,
            direction: "inbound",
            createdAt: new Date(mail.date || Date.now()).toISOString(),
          });
          syncedCount++;
        }
      }
      if (syncedCount > 0) {
        saveDb(db);
      }
    } catch {
      // Ignore Gmail bridge errors silently
    }
  }

  let filtered = [...db.googleChatMessages];
  if (params?.spaceNameOrId && space) {
    const q = params.spaceNameOrId.trim().toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.spaceId.toLowerCase() === (space.spaceId || space.id).toLowerCase() ||
        m.spaceName.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    messages: filtered.slice(0, maxResults),
    syncedCount,
    apiMessage,
    spaceName: space?.name,
  };
}
