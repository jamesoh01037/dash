import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleWebhookStatus,
  registerGoogleWebhooks,
  stopGoogleWebhooks,
} from "@/lib/googleWebhook";

export async function GET(req: NextRequest) {
  try {
    const status = getGoogleWebhookStatus(req.nextUrl.origin);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook status check failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "register";

    if (action === "stop") {
      const res = await stopGoogleWebhooks(req.nextUrl.origin);
      return NextResponse.json(res);
    }

    const res = await registerGoogleWebhooks(req.nextUrl.origin);
    return NextResponse.json(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook watch operation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
