import { NextRequest, NextResponse } from "next/server";
import {
  verifyAndSaveGmailCredentials,
  disconnectGmail,
  getGmailCredentials,
} from "@/lib/gmail";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const config = db.settings.gmailConfig;
  const isConnected = Boolean(config?.email && config?.appPassword);

  return NextResponse.json({
    isConnected,
    email: config?.email,
    connectedAt: config?.connectedAt,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { email, appPassword } = await req.json();
    if (!email || !appPassword) {
      return NextResponse.json(
        { error: "Gmail 주소와 16자리 앱 비밀번호를 입력해 주세요." },
        { status: 400 }
      );
    }

    const verify = await verifyAndSaveGmailCredentials(email, appPassword);
    if (!verify.success) {
      return NextResponse.json({ error: verify.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: verify.message,
      email: email.trim(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  disconnectGmail();
  return NextResponse.json({ success: true, message: "Gmail 연동이 해제되었습니다." });
}
