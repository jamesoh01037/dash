import { NextRequest, NextResponse } from "next/server";
import {
  listGmailMessages,
  getGmailMessageDetails,
  createGmailDraft,
  sendGmailMessage,
} from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const query = searchParams.get("q") || "is:unread";
  const max = Number(searchParams.get("max")) || 10;

  if (id) {
    const detail = await getGmailMessageDetails(id);
    if (!detail.success) {
      return NextResponse.json({ error: detail.error }, { status: 400 });
    }
    return NextResponse.json({ email: detail.email });
  }

  const list = await listGmailMessages(query, max);
  if (!list.success) {
    return NextResponse.json({ error: list.error }, { status: 400 });
  }

  return NextResponse.json({ messages: list.messages || [] });
}

export async function POST(req: NextRequest) {
  try {
    const { action, to, subject, body } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "수신자(to), 제목(subject), 본문(body)이 모두 필요합니다." },
        { status: 400 }
      );
    }

    if (action === "send") {
      const res = await sendGmailMessage(to, subject, body);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, messageId: res.messageId });
    } else {
      // Default: create draft
      const res = await createGmailDraft(to, subject, body);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, draftId: res.draftId });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
