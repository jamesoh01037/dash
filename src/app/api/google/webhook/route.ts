import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import { checkJuniorNotifications } from "@/lib/notifications";
import {
  getGoogleWebhookStatus,
  getWebhookChannelSecret,
} from "@/lib/googleWebhook";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    status: getGoogleWebhookStatus(req.nextUrl.origin),
  });
}

/**
 * Real-time Google Push Notification Webhook receiver.
 * Handles:
 * 1. Google Drive Push Notifications (X-Goog-Channel-ID, X-Goog-Resource-State)
 * 2. Gmail Cloud Pub/Sub Push Notifications (POST JSON { message: { data: base64 } })
 */
export async function POST(req: NextRequest) {
  try {
    const channelId = req.headers.get("x-goog-channel-id");
    const resourceState = req.headers.get("x-goog-resource-state");
    const channelToken = req.headers.get("x-goog-channel-token");

    // 1. Google Drive Push Notification
    if (channelId && resourceState) {
      const expectedToken = getWebhookChannelSecret();
      if (channelToken && channelToken !== expectedToken) {
        return NextResponse.json({ error: "Invalid channel token" }, { status: 403 });
      }

      // Initial channel verification handshake
      if (resourceState === "sync") {
        return NextResponse.json({ ok: true, event: "drive_sync" });
      }

      const db = getDb();
      if (db.notificationState) {
        db.notificationState.lastWebhookEventAt = new Date().toISOString();
        saveDb(db);
      }

      const result = await checkJuniorNotifications();
      return NextResponse.json({
        ok: true,
        source: "google_drive",
        resourceState,
        newCount: result.newCount,
      });
    }

    // 2. Gmail Cloud Pub/Sub Push Notification
    const body = await req.json().catch(() => null);
    if (body?.message?.data) {
      let decoded: { emailAddress?: string; historyId?: string | number } = {};
      try {
        const jsonStr = Buffer.from(body.message.data, "base64").toString("utf8");
        decoded = JSON.parse(jsonStr);
      } catch {
        // proceed even if payload isn't JSON
      }

      const db = getDb();
      if (db.notificationState) {
        db.notificationState.lastWebhookEventAt = new Date().toISOString();
        if (decoded.historyId) {
          db.notificationState.gmailHistoryId = String(decoded.historyId);
        }
        saveDb(db);
      }

      const result = await checkJuniorNotifications();
      return NextResponse.json({
        ok: true,
        source: "gmail_pubsub",
        historyId: decoded.historyId,
        newCount: result.newCount,
      });
    }

    return NextResponse.json({ ok: true, ignored: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
