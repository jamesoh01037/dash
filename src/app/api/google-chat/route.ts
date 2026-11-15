import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import { getGmailCredentials } from "@/lib/gmail";
import {
  getGoogleChatAuthStatus,
  getGoogleChatOAuthUrl,
  listGoogleChatSpaces,
  createGoogleChatSpace,
  listGoogleChatMembers,
  upsertGoogleChatSpace,
  deleteGoogleChatSpace,
  sendGoogleChatMessage,
  updateGoogleChatMessage,
  deleteGoogleChatMessage,
  addGoogleChatReaction,
  getGoogleChatMessages,
} from "@/lib/googleChat";

export async function GET(req: NextRequest) {
  try {
    const syncRemote = req.nextUrl.searchParams.get("sync") === "true";
    const spaceNameOrId = req.nextUrl.searchParams.get("space") || undefined;
    const fetchMembers = req.nextUrl.searchParams.get("members") === "true";

    const { email, appPassword } = getGmailCredentials();
    const authStatus = getGoogleChatAuthStatus();

    const { spaces, remoteError } = await listGoogleChatSpaces(syncRemote);

    if (fetchMembers && spaceNameOrId) {
      const memberRes = await listGoogleChatMembers(spaceNameOrId);
      return NextResponse.json({
        members: memberRes.members,
        space: memberRes.space,
        error: memberRes.error,
      });
    }

    const { messages, syncedCount, apiMessage } = await getGoogleChatMessages({
      spaceNameOrId,
      maxResults: 40,
      syncFromGmail: syncRemote,
    });

    return NextResponse.json({
      spaces,
      messages,
      syncedCount,
      authStatus,
      hasAccessToken: authStatus.hasAccessToken,
      gmailConnected: Boolean(email && appPassword),
      remoteError,
      apiMessage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Chat 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "send_message";

    if (action === "add_space") {
      if (!body.name) {
        return NextResponse.json(
          { error: "스페이스(채팅방) 이름을 입력해 주세요." },
          { status: 400 }
        );
      }
      if (!body.webhookUrl && !body.spaceId) {
        return NextResponse.json(
          { error: "Google Chat 웹훅 URL 또는 스페이스 ID(spaces/...)를 입력해 주세요." },
          { status: 400 }
        );
      }

      const space = upsertGoogleChatSpace({
        name: String(body.name),
        webhookUrl: body.webhookUrl ? String(body.webhookUrl) : undefined,
        spaceId: body.spaceId ? String(body.spaceId) : undefined,
        spaceType: body.spaceType ? String(body.spaceType) : "SPACE",
        description: body.description ? String(body.description) : undefined,
      });

      return NextResponse.json({
        success: true,
        space,
        message: `'${space.name}' 스페이스가 등록되었습니다.`,
      });
    }

    if (action === "create_space") {
      if (!body.displayName) {
        return NextResponse.json(
          { error: "생성할 스페이스 이름을 입력해 주세요." },
          { status: 400 }
        );
      }
      const memberEmails = Array.isArray(body.memberEmails)
        ? body.memberEmails.map(String)
        : typeof body.memberEmails === "string"
        ? body.memberEmails
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : undefined;

      const res = await createGoogleChatSpace({
        displayName: String(body.displayName),
        description: body.description ? String(body.description) : undefined,
        memberEmails,
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        space: res.space,
        message: `Google Chat 스페이스 '${res.space?.name}'가 생성되었습니다!`,
      });
    }

    if (action === "list_members") {
      const res = await listGoogleChatMembers(
        body.spaceNameOrId ? String(body.spaceNameOrId) : undefined
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error, members: [] }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        space: res.space,
        members: res.members,
      });
    }

    if (action === "save_oauth_config") {
      const db = getDb();
      const prev = db.settings.googleChatConfig || {};
      const clientId = String(body.clientId || "").trim();
      const clientSecret = String(body.clientSecret || "").trim();

      db.settings.googleChatConfig = {
        ...prev,
        authMode: "oauth2",
        clientId: clientId || prev.clientId,
        clientSecret: clientSecret || prev.clientSecret,
      };
      if (clientId) db.settings.googleClientId = clientId;
      if (clientSecret) db.settings.googleClientSecret = clientSecret;
      saveDb(db);

      const { url, error } = getGoogleChatOAuthUrl();
      if (error || !url) {
        return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        authUrl: url,
        authStatus: getGoogleChatAuthStatus(),
        message: "OAuth 2.0 클라이언트 정보가 저장되었습니다. Google 인증 화면으로 이동합니다.",
      });
    }

    if (action === "save_service_account") {
      const rawJson = String(body.serviceAccountJson || "").trim();
      const db = getDb();
      const prev = db.settings.googleChatConfig || {};
      db.settings.googleChatConfig = {
        ...prev,
        authMode: rawJson ? "service_account" : prev.authMode,
        serviceAccountJson: rawJson || undefined,
        connectedAt: rawJson ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      const { spaces, remoteError } = await listGoogleChatSpaces(Boolean(rawJson));
      return NextResponse.json({
        success: true,
        authStatus: getGoogleChatAuthStatus(),
        spaces,
        remoteError,
        message: rawJson
          ? "서비스 계정(Service Account) 키가 저장되었으며 스페이스 목록을 동기화했습니다."
          : "서비스 계정 설정이 초기화되었습니다.",
      });
    }

    if (action === "save_token") {
      const token = String(body.accessToken || "").trim();
      const db = getDb();
      const prev = db.settings.googleChatConfig || {};
      db.settings.googleChatConfig = {
        ...prev,
        authMode: token ? "token" : "webhook",
        accessToken: token || undefined,
        connectedAt: token ? new Date().toISOString() : undefined,
      };
      saveDb(db);

      const { spaces, remoteError } = await listGoogleChatSpaces(Boolean(token));

      return NextResponse.json({
        success: true,
        authStatus: getGoogleChatAuthStatus(),
        hasAccessToken: Boolean(token),
        spaces,
        remoteError,
        message: token
          ? "Google Chat REST API 액세스 토큰이 저장되었으며 스페이스 목록을 동기화했습니다."
          : "Google Chat API 액세스 토큰이 초기화되었습니다.",
      });
    }

    if (action === "send_message") {
      if (!body.text || !String(body.text).trim()) {
        return NextResponse.json(
          { error: "전송할 메시지 내용을 입력해 주세요." },
          { status: 400 }
        );
      }

      const res = await sendGoogleChatMessage({
        spaceNameOrId: body.spaceNameOrId ? String(body.spaceNameOrId) : undefined,
        text: String(body.text),
        title: body.title ? String(body.title) : undefined,
        subtitle: body.subtitle ? String(body.subtitle) : undefined,
        buttonText: body.buttonText ? String(body.buttonText) : undefined,
        buttonUrl: body.buttonUrl ? String(body.buttonUrl) : undefined,
        threadName: body.threadName ? String(body.threadName) : undefined,
        threadKey: body.threadKey ? String(body.threadKey) : undefined,
        useCard: Boolean(body.useCard),
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        space: res.space,
        messageLog: res.messageLog,
        message: `'${res.space?.name}' 스페이스로 메시지를 전송했습니다!`,
      });
    }

    if (action === "update_message") {
      if (!body.messageName || !body.text) {
        return NextResponse.json(
          { error: "수정할 메시지 ID와 내용을 입력해 주세요." },
          { status: 400 }
        );
      }
      const res = await updateGoogleChatMessage({
        messageName: String(body.messageName),
        text: String(body.text),
      });
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: "메시지가 수정되었습니다.",
      });
    }

    if (action === "delete_message") {
      if (!body.messageName) {
        return NextResponse.json({ error: "삭제할 메시지 ID가 필요합니다." }, { status: 400 });
      }
      const res = await deleteGoogleChatMessage(String(body.messageName));
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: "메시지가 삭제되었습니다.",
      });
    }

    if (action === "add_reaction") {
      if (!body.messageName || !body.emoji) {
        return NextResponse.json(
          { error: "메시지 ID와 이모지가 필요합니다." },
          { status: 400 }
        );
      }
      const res = await addGoogleChatReaction({
        messageName: String(body.messageName),
        emoji: String(body.emoji),
      });
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        message: `'${body.emoji}' 리액션을 추가했습니다.`,
      });
    }

    if (action === "sync_messages") {
      const res = await getGoogleChatMessages({
        spaceNameOrId: body.spaceNameOrId ? String(body.spaceNameOrId) : undefined,
        maxResults: 40,
        syncFromGmail: true,
      });

      return NextResponse.json({
        success: true,
        messages: res.messages,
        syncedCount: res.syncedCount,
        apiMessage: res.apiMessage,
        message: `Google Chat 메시지 동기화 완료 (신규 ${res.syncedCount}건)`,
      });
    }

    return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Chat 요청 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "삭제할 스페이스 ID가 필요합니다." }, { status: 400 });
  }

  const removed = deleteGoogleChatSpace(id);
  if (!removed) {
    return NextResponse.json({ error: "대상 스페이스를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    removed,
  });
}
