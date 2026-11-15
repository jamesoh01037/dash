import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  getGoogleContactsAuthStatus,
  getGoogleContactsOAuthUrl,
  listOrSearchContacts,
  searchContactsWithPeopleApi,
  upsertContactWithCloudSync,
  deleteContactWithCloudSync,
  toggleContactStar,
  listContactGroups,
  createContactGroup,
  syncGooglePeopleApiContacts,
  syncContactsFromGmail,
  importGoogleContactsFile,
} from "@/lib/contacts";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || undefined;
  const group = req.nextUrl.searchParams.get("group") || undefined;
  const source = req.nextUrl.searchParams.get("source") || undefined;
  const starredOnly = req.nextUrl.searchParams.get("starred") === "true";
  const liveRemoteSearch = req.nextUrl.searchParams.get("remote") === "true";

  let remoteDiscoveredCount = 0;
  if (liveRemoteSearch && query) {
    const remoteRes = await searchContactsWithPeopleApi(query);
    remoteDiscoveredCount = remoteRes.remoteDiscoveredCount;
  }

  const contacts = listOrSearchContacts(query, { group, source, starredOnly });
  const groups = listContactGroups();
  const authStatus = getGoogleContactsAuthStatus();

  return NextResponse.json({
    contacts,
    groups,
    authStatus,
    remoteDiscoveredCount,
    totalCount: contacts.length,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "create";

    if (action === "sync_people_api") {
      const res = await syncGooglePeopleApiContacts(true);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        addedCount: res.addedCount,
        updatedCount: res.updatedCount,
        totalContacts: res.totalContacts,
        groupsCount: res.groupsCount,
        contacts: listOrSearchContacts(),
        groups: listContactGroups(),
        authStatus: getGoogleContactsAuthStatus(),
        message: `Google People API 클라우드 동기화 완료! (신규 ${res.addedCount}명, 업데이트 ${res.updatedCount}명, 총 ${res.totalContacts}명)`,
      });
    }

    if (action === "sync_gmail") {
      const res = await syncContactsFromGmail(body.maxMessages || 60);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        addedCount: res.addedCount,
        totalContacts: res.totalContacts,
        contacts: listOrSearchContacts(),
        message: `Gmail에서 ${res.addedCount}개의 새 연락처를 동기화했습니다. (총 ${res.totalContacts}명)`,
      });
    }

    if (action === "import_file") {
      if (!body.content) {
        return NextResponse.json({ error: "파일 내용이 비어 있습니다." }, { status: 400 });
      }
      const res = importGoogleContactsFile(
        String(body.content),
        String(body.fileName || "contacts.csv")
      );
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        importedCount: res.importedCount,
        totalContacts: res.totalContacts,
        contacts: listOrSearchContacts(),
        message: `Google 주소록 파일에서 ${res.importedCount}명의 연락처를 가져왔습니다!`,
      });
    }

    if (action === "save_oauth_config") {
      const db = getDb();
      const prev = db.settings.googleContactsConfig || {};
      const clientId = String(body.clientId || "").trim();
      const clientSecret = String(body.clientSecret || "").trim();

      db.settings.googleContactsConfig = {
        ...prev,
        authMode: "oauth2",
        clientId: clientId || prev.clientId,
        clientSecret: clientSecret || prev.clientSecret,
      };
      if (clientId) db.settings.googleClientId = clientId;
      if (clientSecret) db.settings.googleClientSecret = clientSecret;
      saveDb(db);

      const { url, error } = getGoogleContactsOAuthUrl();
      if (error || !url) {
        return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        authUrl: url,
        authStatus: getGoogleContactsAuthStatus(),
      });
    }

    if (action === "save_token") {
      const token = String(body.accessToken || "").trim();
      const db = getDb();
      const prev = db.settings.googleContactsConfig || {};
      db.settings.googleContactsConfig = {
        ...prev,
        authMode: token ? "token" : "gmail_imap",
        accessToken: token || undefined,
        connectedAt: token ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      let syncMsg = "People API 토큰이 초기화되었습니다.";
      if (token) {
        const syncRes = await syncGooglePeopleApiContacts(true);
        syncMsg = syncRes.success
          ? `People API 토큰 저장 및 클라우드 주소록 동기화 완료! (총 ${syncRes.totalContacts}명)`
          : `토큰은 저장되었으나 동기화 중 경고가 발생했습니다: ${syncRes.error}`;
      }

      return NextResponse.json({
        success: true,
        authStatus: getGoogleContactsAuthStatus(),
        contacts: listOrSearchContacts(),
        groups: listContactGroups(),
        message: syncMsg,
      });
    }

    if (action === "create_group") {
      if (!body.name) {
        return NextResponse.json({ error: "그룹(라벨) 이름이 필요합니다." }, { status: 400 });
      }
      const res = await createContactGroup(String(body.name));
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        group: res.group,
        groups: listContactGroups(),
        message: `새 주소록 그룹(라벨) '${res.group?.name}'가 생성되었습니다.`,
      });
    }

    if (action === "toggle_star") {
      if (!body.id) {
        return NextResponse.json({ error: "대상 연락처 ID가 필요합니다." }, { status: 400 });
      }
      const updated = toggleContactStar(String(body.id));
      if (!updated) {
        return NextResponse.json({ error: "연락처를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        contact: updated,
      });
    }

    // Default: "create" or "update" contact (with automatic two-way People API Cloud sync)
    if (!body.name && !body.email) {
      return NextResponse.json(
        { error: "이름 또는 이메일 주소는 필수입니다." },
        { status: 400 }
      );
    }

    const groups = Array.isArray(body.groups)
      ? body.groups.map(String)
      : typeof body.groups === "string" && body.groups.trim()
      ? body.groups
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;

    const { contact, cloudSynced, cloudError } = await upsertContactWithCloudSync({
      id: body.id ? String(body.id) : undefined,
      resourceName: body.resourceName ? String(body.resourceName) : undefined,
      name: String(body.name || ""),
      email: String(body.email || ""),
      phone: body.phone ? String(body.phone) : undefined,
      company: body.company ? String(body.company) : undefined,
      role: body.role ? String(body.role) : undefined,
      department: body.department ? String(body.department) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      groups,
      starred: body.starred !== undefined ? Boolean(body.starred) : undefined,
      source: body.source || "manual",
    });

    return NextResponse.json({
      success: true,
      contact,
      cloudSynced,
      cloudError,
      message: `${contact.name}님의 연락처가 저장되었습니다.${
        cloudSynced ? " (Google People API 클라우드 양방향 반영 완료)" : ""
      }`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "연락처 처리 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "삭제할 연락처 ID가 필요합니다." }, { status: 400 });
  }

  const res = await deleteContactWithCloudSync(id);
  if (!res.success) {
    return NextResponse.json({ error: res.error }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    deleted: res.deleted,
    cloudDeleted: res.cloudDeleted,
  });
}
