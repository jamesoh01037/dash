import crypto from "crypto";
import { getDb, saveDb } from "./db";
import { getValidGoogleDriveToken } from "./googleDrive";

export interface GoogleWebhookStatus {
  mode: "webhook" | "local_manual";
  isPublicHttps: boolean;
  baseUrl: string | null;
  webhookUrl: string | null;
  hasPubSubTopic: boolean;
  driveWatchActive: boolean;
  driveChannelExpiration?: string;
  gmailWatchActive: boolean;
  gmailWatchExpiration?: string;
  lastWebhookEventAt?: string;
}

/**
 * Resolves the public HTTPS base URL for Google Push Notifications / Webhooks.
 * Returns isPublicHttps=false when running locally on localhost/127.0.0.1.
 */
export function resolvePublicWebhookBaseUrl(reqOrigin?: string): {
  isPublicHttps: boolean;
  baseUrl: string | null;
  webhookUrl: string | null;
} {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    reqOrigin,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim().replace(/\/+$/, "");
    if (!trimmed) continue;

    try {
      const parsed = new URL(trimmed);
      const isLocal =
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "0.0.0.0" ||
        parsed.hostname.endsWith(".local");
      if (parsed.protocol === "https:" && !isLocal) {
        return {
          isPublicHttps: true,
          baseUrl: trimmed,
          webhookUrl: `${trimmed}/api/google/webhook`,
        };
      }
    } catch {
      // ignore invalid URL candidate
    }
  }

  return {
    isPublicHttps: false,
    baseUrl: reqOrigin || null,
    webhookUrl: null,
  };
}

export function getWebhookChannelSecret(): string {
  const rawSecret =
    process.env.GOOGLE_WEBHOOK_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "dash-google-webhook-secret";
  return crypto.createHash("sha256").update(rawSecret).digest("hex").slice(0, 32);
}

export function getGoogleWebhookStatus(reqOrigin?: string): GoogleWebhookStatus {
  const db = getDb();
  const state = db.notificationState;
  const { isPublicHttps, baseUrl, webhookUrl } = resolvePublicWebhookBaseUrl(reqOrigin);

  const now = Date.now();
  const driveExp = state?.driveChannelExpiration
    ? Number(state.driveChannelExpiration)
    : 0;
  const gmailExp = state?.gmailWatchExpiration
    ? Number(state.gmailWatchExpiration)
    : 0;

  const driveWatchActive = Boolean(
    isPublicHttps && state?.driveChannelId && (!driveExp || driveExp > now)
  );
  const gmailWatchActive = Boolean(
    isPublicHttps && state?.gmailWatchExpiration && gmailExp > now
  );

  return {
    mode: isPublicHttps ? "webhook" : "local_manual",
    isPublicHttps,
    baseUrl,
    webhookUrl,
    hasPubSubTopic: Boolean(process.env.GMAIL_PUBSUB_TOPIC),
    driveWatchActive,
    driveChannelExpiration: state?.driveChannelExpiration,
    gmailWatchActive,
    gmailWatchExpiration: state?.gmailWatchExpiration,
    lastWebhookEventAt: state?.lastWebhookEventAt,
  };
}

/**
 * Registers real-time Google Drive (changes.watch) and Gmail (users.watch via Pub/Sub)
 * webhooks when deployed on a public HTTPS domain.
 */
export async function registerGoogleWebhooks(reqOrigin?: string): Promise<{
  ok: boolean;
  mode: "webhook" | "local_manual";
  message: string;
  driveRegistered?: boolean;
  gmailRegistered?: boolean;
  status: GoogleWebhookStatus;
}> {
  const { isPublicHttps, webhookUrl } = resolvePublicWebhookBaseUrl(reqOrigin);
  if (!isPublicHttps || !webhookUrl) {
    return {
      ok: false,
      mode: "local_manual",
      message:
        "로컬(localhost) 환경에서는 Google 실시간 Webhook을 수신할 수 없습니다. 배포(HTTPS) 시 자동 전환되며, 로컬에서는 '즉시 체크' 버튼을 이용해 주세요.",
      status: getGoogleWebhookStatus(reqOrigin),
    };
  }

  const accessToken = await getValidGoogleDriveToken();
  if (!accessToken) {
    return {
      ok: false,
      mode: "webhook",
      message: "Google OAuth 토큰이 없습니다. 먼저 Google 계정으로 로그인해 주세요.",
      status: getGoogleWebhookStatus(reqOrigin),
    };
  }

  const db = getDb();
  if (!db.notificationState) {
    db.notificationState = {
      enabled: true,
      intervalMinutes: 5,
      initializedBaseline: false,
      processedDriveFileIds: [],
    };
  }

  let driveRegistered = false;
  let gmailRegistered = false;
  const errors: string[] = [];

  // 1. Register Google Drive changes.watch
  try {
    const startTokenRes = await fetch(
      "https://www.googleapis.com/drive/v3/changes/startPageToken",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!startTokenRes.ok) {
      throw new Error(`startPageToken failed (${startTokenRes.status})`);
    }
    const startTokenData = (await startTokenRes.json()) as { startPageToken?: string };
    const startPageToken = startTokenData.startPageToken || "1";

    const channelId = crypto.randomUUID();
    const expirationMs = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 days (Drive max ~7d)

    const watchRes = await fetch(
      `https://www.googleapis.com/drive/v3/changes/watch?pageToken=${encodeURIComponent(startPageToken)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: getWebhookChannelSecret(),
          expiration: String(expirationMs),
        }),
      }
    );

    if (!watchRes.ok) {
      const errText = await watchRes.text();
      throw new Error(`Drive watch failed (${watchRes.status}): ${errText}`);
    }

    const watchData = (await watchRes.json()) as {
      id?: string;
      resourceId?: string;
      expiration?: string;
    };

    db.notificationState.driveChannelId = watchData.id || channelId;
    db.notificationState.driveResourceId = watchData.resourceId;
    db.notificationState.driveChannelExpiration =
      watchData.expiration || String(expirationMs);
    db.notificationState.driveStartPageToken = startPageToken;
    driveRegistered = true;
  } catch (err) {
    errors.push(
      `Drive Webhook 등록 오류: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. Register Gmail users.watch (requires GMAIL_PUBSUB_TOPIC env var)
  const pubsubTopic = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (pubsubTopic) {
    try {
      const gmailRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/watch",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topicName: pubsubTopic,
            labelIds: ["INBOX"],
          }),
        }
      );

      if (!gmailRes.ok) {
        const errText = await gmailRes.text();
        throw new Error(`Gmail watch failed (${gmailRes.status}): ${errText}`);
      }

      const gmailData = (await gmailRes.json()) as {
        historyId?: string;
        expiration?: string;
      };
      db.notificationState.gmailHistoryId = gmailData.historyId;
      db.notificationState.gmailWatchExpiration = gmailData.expiration;
      gmailRegistered = true;
    } catch (err) {
      errors.push(
        `Gmail Pub/Sub Watch 등록 오류: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  db.notificationState.watchMode = "webhook";
  db.notificationState.webhookUrl = webhookUrl;
  saveDb(db);

  const ok = driveRegistered || gmailRegistered;
  const messageParts: string[] = [];
  if (driveRegistered) messageParts.push("Google Drive 실시간 Webhook 등록 완료");
  if (gmailRegistered) messageParts.push("Gmail Pub/Sub 실시간 Watch 등록 완료");
  if (!pubsubTopic) {
    messageParts.push(
      "Gmail 실시간 푸시는 서버 환경변수 GMAIL_PUBSUB_TOPIC 설정 시 활성화됩니다"
    );
  }
  if (errors.length > 0) messageParts.push(errors.join(" / "));

  return {
    ok,
    mode: "webhook",
    message: messageParts.join(" · "),
    driveRegistered,
    gmailRegistered,
    status: getGoogleWebhookStatus(reqOrigin),
  };
}

export async function stopGoogleWebhooks(reqOrigin?: string): Promise<{
  ok: boolean;
  status: GoogleWebhookStatus;
}> {
  const db = getDb();
  const state = db.notificationState;
  const accessToken = await getValidGoogleDriveToken();

  if (accessToken && state) {
    if (state.driveChannelId && state.driveResourceId) {
      try {
        await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: state.driveChannelId,
            resourceId: state.driveResourceId,
          }),
        });
      } catch {
        // ignore stop errors
      }
    }

    if (state.gmailWatchExpiration) {
      try {
        await fetch("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // ignore stop errors
      }
    }
  }

  if (db.notificationState) {
    db.notificationState.watchMode = "local_manual";
    db.notificationState.driveChannelId = undefined;
    db.notificationState.driveResourceId = undefined;
    db.notificationState.driveChannelExpiration = undefined;
    db.notificationState.gmailWatchExpiration = undefined;
    saveDb(db);
  }

  return {
    ok: true,
    status: getGoogleWebhookStatus(reqOrigin),
  };
}
