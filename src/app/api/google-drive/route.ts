import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/db";
import {
  getGoogleDriveAuthStatus,
  getGoogleDriveOAuthUrl,
  syncGoogleDriveFiles,
  listOrSearchDriveFiles,
  readDriveFileContent,
  createDriveFileOrDoc,
  updateDriveFile,
  shareDriveFile,
  deleteDriveFile,
} from "@/lib/googleDrive";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q") || undefined;
    const mimeCategory = (req.nextUrl.searchParams.get("type") || "all") as
      | "all"
      | "doc"
      | "sheet"
      | "slide"
      | "hwp"
      | "folder"
      | "pdf_other";
    const starredOnly = req.nextUrl.searchParams.get("starred") === "true";
    const folderId = req.nextUrl.searchParams.get("folderId") || undefined;
    const syncRemote = req.nextUrl.searchParams.get("sync") === "true";
    const readId = req.nextUrl.searchParams.get("readId");

    if (readId) {
      const readRes = await readDriveFileContent(readId);
      if (!readRes.success) {
        return NextResponse.json({ error: readRes.error }, { status: 400 });
      }
      return NextResponse.json({
        file: readRes.file,
        content: readRes.content,
      });
    }

    let syncError: string | undefined;
    if (syncRemote) {
      const syncRes = await syncGoogleDriveFiles({ query, folderId });
      if (!syncRes.success) {
        syncError = syncRes.error;
      }
    }

    const files = listOrSearchDriveFiles({
      query,
      mimeCategory,
      starredOnly,
      folderId,
    });
    const authStatus = getGoogleDriveAuthStatus();

    return NextResponse.json({
      files,
      authStatus,
      syncError,
      totalCount: files.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google Drive 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "create_doc";

    if (action === "sync_drive") {
      const res = await syncGoogleDriveFiles({
        query: body.query ? String(body.query) : undefined,
        folderId: body.folderId ? String(body.folderId) : undefined,
      });
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        addedCount: res.addedCount,
        updatedCount: res.updatedCount,
        totalFiles: res.totalFiles,
        files: listOrSearchDriveFiles(),
        authStatus: getGoogleDriveAuthStatus(),
        message: `Google Drive 클라우드 동기화 완료! (신규 ${res.addedCount}건, 업데이트 ${res.updatedCount}건, 총 ${res.totalFiles}건)`,
      });
    }

    if (action === "save_oauth_config") {
      const db = getDb();
      const prev = db.settings.googleDriveConfig || {};
      const clientId = String(body.clientId || "").trim();
      const clientSecret = String(body.clientSecret || "").trim();

      db.settings.googleDriveConfig = {
        ...prev,
        authMode: "oauth2",
        clientId: clientId || prev.clientId,
        clientSecret: clientSecret || prev.clientSecret,
      };
      if (clientId) db.settings.googleClientId = clientId;
      if (clientSecret) db.settings.googleClientSecret = clientSecret;
      saveDb(db);

      const { url, error } = getGoogleDriveOAuthUrl();
      if (error || !url) {
        return NextResponse.json({ error: error || "OAuth URL 생성 실패" }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        authUrl: url,
        authStatus: getGoogleDriveAuthStatus(),
      });
    }

    if (action === "save_service_account") {
      const rawJson = String(body.serviceAccountJson || "").trim();
      const db = getDb();
      const prev = db.settings.googleDriveConfig || {};
      db.settings.googleDriveConfig = {
        ...prev,
        authMode: rawJson ? "service_account" : prev.authMode,
        serviceAccountJson: rawJson || undefined,
        connectedAt: rawJson ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      if (rawJson) {
        await syncGoogleDriveFiles();
      }
      return NextResponse.json({
        success: true,
        authStatus: getGoogleDriveAuthStatus(),
        files: listOrSearchDriveFiles(),
        message: rawJson
          ? "서비스 계정(Service Account) 키가 저장되었으며 Google Drive 파일 목록을 동기화했습니다."
          : "서비스 계정 설정이 초기화되었습니다.",
      });
    }

    if (action === "save_token") {
      const token = String(body.accessToken || "").trim();
      const db = getDb();
      const prev = db.settings.googleDriveConfig || {};
      db.settings.googleDriveConfig = {
        ...prev,
        authMode: token ? "token" : "local",
        accessToken: token || undefined,
        connectedAt: token ? new Date().toISOString() : prev.connectedAt,
      };
      saveDb(db);

      let syncMsg = "Google Drive 토큰이 초기화되었습니다.";
      if (token) {
        const syncRes = await syncGoogleDriveFiles();
        syncMsg = syncRes.success
          ? `Google Drive 토큰 저장 및 클라우드 파일 동기화 완료! (총 ${syncRes.totalFiles}건)`
          : `토큰은 저장되었으나 동기화 중 경고가 발생했습니다: ${syncRes.error}`;
      }

      return NextResponse.json({
        success: true,
        authStatus: getGoogleDriveAuthStatus(),
        files: listOrSearchDriveFiles(),
        message: syncMsg,
      });
    }

    if (action === "create_doc" || action === "create_folder") {
      if (!body.name) {
        return NextResponse.json(
          { error: "생성할 문서 또는 폴더 이름을 입력해 주세요." },
          { status: 400 }
        );
      }

      const res = await createDriveFileOrDoc({
        name: String(body.name),
        content: body.content ? String(body.content) : undefined,
        docType:
          action === "create_folder"
            ? "folder"
            : body.docType || "google_doc",
        parentFolderId: body.parentFolderId ? String(body.parentFolderId) : undefined,
        description: body.description ? String(body.description) : undefined,
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        file: res.file,
        cloudSynced: res.cloudSynced,
        files: listOrSearchDriveFiles(),
        message: `'${res.file?.name}' 문서/폴더가 생성되었습니다.${
          res.cloudSynced ? " (Google Drive 클라우드 반영 완료)" : " (로컬 워크스페이스 저장됨)"
        }`,
      });
    }

    if (action === "update_file") {
      if (!body.fileIdOrName) {
        return NextResponse.json({ error: "대상 파일 ID가 필요합니다." }, { status: 400 });
      }

      const res = await updateDriveFile({
        fileIdOrName: String(body.fileIdOrName),
        newName: body.newName !== undefined ? String(body.newName) : undefined,
        content: body.content !== undefined ? String(body.content) : undefined,
        starred: body.starred !== undefined ? Boolean(body.starred) : undefined,
        description: body.description !== undefined ? String(body.description) : undefined,
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        file: res.file,
        cloudSynced: res.cloudSynced,
        files: listOrSearchDriveFiles(),
        message: `'${res.file?.name}' 파일이 업데이트되었습니다.`,
      });
    }

    if (action === "share_file") {
      if (!body.fileIdOrName) {
        return NextResponse.json({ error: "공유할 파일 ID가 필요합니다." }, { status: 400 });
      }

      const res = await shareDriveFile({
        fileIdOrName: String(body.fileIdOrName),
        email: body.email ? String(body.email) : undefined,
        role: body.role || "reader",
        makePublicLink: Boolean(body.makePublicLink),
      });

      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        file: res.file,
        webViewLink: res.webViewLink,
        message: body.email
          ? `'${res.file?.name}' 파일을 ${body.email}님에게 공유했습니다.`
          : `'${res.file?.name}' 파일의 공유 링크가 활성화되었습니다.`,
      });
    }

    return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google Drive 요청 처리 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "삭제할 파일 ID가 필요합니다." }, { status: 400 });
  }

  const res = await deleteDriveFile(id);
  if (!res.success) {
    return NextResponse.json({ error: res.error }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    deleted: res.deleted,
    cloudDeleted: res.cloudDeleted,
  });
}
