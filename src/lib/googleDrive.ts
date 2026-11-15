import crypto from "crypto";
import zlib from "zlib";
import {
  getDb,
  saveDb,
  GoogleDriveFileItem,
  GoogleDriveConfig,
} from "./db";
import { generateId } from "./utils";

export function isHwpFile(name = "", mimeType = ""): boolean {
  const n = name.trim().toLowerCase();
  const m = mimeType.trim().toLowerCase();
  return (
    n.endsWith(".hwp") ||
    n.endsWith(".hwpx") ||
    m.includes("hwp") ||
    m.includes("haansoft") ||
    m.includes("hancom")
  );
}

/**
 * Extracts readable text from a .hwpx (ZIP/OWPML XML) or .hwp binary buffer.
 */
export function extractReadableTextFromHwpBuffer(buf: Buffer, fileName = ""): string {
  try {
    // 1. Check if it's plain UTF-8 text (e.g. text-based HWP/HWPX created in workspace)
    const utf8Sample = buf.subarray(0, Math.min(buf.length, 512)).toString("utf-8");
    if (
      !buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && // Not PK ZIP
      !buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) && // Not OLE2 CFB
      !/[\x00-\x08\x0E-\x1F]/.test(utf8Sample)
    ) {
      return buf.toString("utf-8");
    }

    // 2. If .hwpx (ZIP archive starting with PK\x03\x04), scan local file headers for XML / PrvText.txt
    if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      const extractedChunks: string[] = [];
      let offset = 0;
      while (offset + 30 < buf.length) {
        if (buf.readUInt32LE(offset) !== 0x04034b50) break;
        const compressionMethod = buf.readUInt16LE(offset + 8);
        const compressedSize = buf.readUInt32LE(offset + 18);
        const fileNameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        const entryName = buf
          .subarray(offset + 30, offset + 30 + fileNameLen)
          .toString("utf-8");
        const dataStart = offset + 30 + fileNameLen + extraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buf.length) break;

        if (
          entryName.endsWith(".xml") ||
          entryName.endsWith(".txt") ||
          entryName.includes("section") ||
          entryName.includes("PrvText")
        ) {
          try {
            const rawSlice = buf.subarray(dataStart, dataEnd);
            const decompressed =
              compressionMethod === 8
                ? zlib.inflateRawSync(rawSlice)
                : compressionMethod === 0
                ? rawSlice
                : null;
            if (decompressed) {
              const xmlOrTxt = decompressed.toString("utf-8");
              if (entryName.endsWith(".txt")) {
                extractedChunks.push(xmlOrTxt.trim());
              } else {
                const tagMatches = xmlOrTxt.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g);
                if (tagMatches && tagMatches.length > 0) {
                  const textLines = tagMatches
                    .map((t) => t.replace(/<[^>]+>/g, "").trim())
                    .filter(Boolean);
                  extractedChunks.push(textLines.join("\n"));
                }
              }
            }
          } catch {
            // ignore individual entry decompression error
          }
        }
        offset = dataEnd;
      }

      if (extractedChunks.length > 0) {
        return extractedChunks.join("\n\n").trim();
      }
    }

    // 3. For OLE2 .hwp v5 binary, extract readable UTF-16LE Korean/ASCII runs (such as PrvText stream)
    const utf16Text = buf.toString("utf16le");
    const readableMatches = utf16Text.match(
      /[가-힣a-zA-Z0-9\s.,!?()[\]\-_~:;'"/@#$%^&*+=<>]{8,}/g
    );
    if (readableMatches && readableMatches.length > 0) {
      return readableMatches
        .map((s) => s.trim())
        .filter(
          (s) =>
            s.length >= 4 &&
            !/^[A-Za-z0-9_\s]+$/.test(s) &&
            !s.includes("Root Entry") &&
            !s.includes("HwpSummaryInformation")
        )
        .slice(0, 120)
        .join("\n");
    }

    return `[한글 문서 (${fileName}) — 크롬 rhwp 확장프로그램 전용 뷰어에서 전체 서식과 본문을 확인·편집하실 수 있습니다.]`;
  } catch {
    return `[한글 문서 (${fileName}) — 크롬 rhwp 확장프로그램을 통해 열람 및 편집이 가능합니다.]`;
  }
}

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

/**
 * Resolves OAuth 2.0 Client ID and Secret (shared across Drive, Chat, Contacts, and AppSettings).
 */
export function getGoogleDriveOAuthCredentials(): {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
} {
  const db = getDb();
  const clientId =
    db.settings.googleDriveConfig?.clientId ||
    db.settings.googleChatConfig?.clientId ||
    db.settings.googleContactsConfig?.clientId ||
    db.settings.googleClientId ||
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    db.settings.googleDriveConfig?.clientSecret ||
    db.settings.googleChatConfig?.clientSecret ||
    db.settings.googleContactsConfig?.clientSecret ||
    db.settings.googleClientSecret ||
    process.env.GOOGLE_CLIENT_SECRET;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/google-drive/callback`;

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generates the Google OAuth 2.0 Authorization URL for full Google Drive API v3 access.
 */
export function getGoogleDriveOAuthUrl(): { url?: string; error?: string } {
  const { clientId, redirectUri } = getGoogleDriveOAuthCredentials();
  if (!clientId) {
    return {
      error:
        "Google OAuth Client ID가 설정되어 있지 않습니다. [OAuth 2.0 / Drive API 설정] 모달에서 Client ID와 Client Secret을 입력해 주세요.",
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_DRIVE_SCOPES.join(" "),
  });

  return { url: `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}` };
}

/**
 * Exchanges an OAuth 2.0 authorization code for access_token and refresh_token.
 */
export async function exchangeGoogleDriveCodeForTokens(code: string): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleDriveOAuthCredentials();
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
      // ignore
    }

    const db = getDb();
    const prev = db.settings.googleDriveConfig || {};
    const updated: GoogleDriveConfig = {
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

    db.settings.googleDriveConfig = updated;
    saveDb(db);

    return { success: true, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth 통신 오류";
    return { success: false, error: msg };
  }
}

/**
 * Signs a RS256 JWT with a Google Cloud Service Account JSON key for Google Drive API v3.
 */
async function getDriveServiceAccountToken(serviceAccountRaw: string): Promise<string | null> {
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
      scope: "https://www.googleapis.com/auth/drive",
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
    db.settings.googleDriveConfig = {
      ...(db.settings.googleDriveConfig || {}),
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
 * Returns a valid Google Drive API v3 Bearer token, automatically refreshing via OAuth 2.0 refresh_token or Service Account JWT if expired.
 */
export async function getValidGoogleDriveToken(): Promise<string | null> {
  const db = getDb();
  const cfg = db.settings.googleDriveConfig;
  const isExpired = cfg?.expiryDate ? Date.now() > cfg.expiryDate - 60_000 : false;

  if (cfg?.accessToken && !isExpired) {
    return cfg.accessToken;
  }

  if (cfg?.refreshToken) {
    const { clientId, clientSecret } = getGoogleDriveOAuthCredentials();
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
            db.settings.googleDriveConfig = {
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

  if (cfg?.serviceAccountJson) {
    const saToken = await getDriveServiceAccountToken(cfg.serviceAccountJson);
    if (saToken) return saToken;
  }

  return cfg?.accessToken || process.env.GOOGLE_DRIVE_ACCESS_TOKEN || null;
}

/**
 * Returns connection & storage status for the Google Drive Hub UI.
 */
export function getGoogleDriveAuthStatus() {
  const db = getDb();
  const cfg = db.settings.googleDriveConfig;
  const { clientId, redirectUri } = getGoogleDriveOAuthCredentials();
  const hasDriveToken = Boolean(
    cfg?.accessToken ||
      cfg?.refreshToken ||
      cfg?.serviceAccountJson ||
      process.env.GOOGLE_DRIVE_ACCESS_TOKEN
  );

  return {
    authMode: cfg?.authMode || (hasDriveToken ? "token" : "local"),
    hasDriveToken,
    hasOAuthClient: Boolean(clientId),
    hasRefreshToken: Boolean(cfg?.refreshToken),
    hasServiceAccount: Boolean(cfg?.serviceAccountJson),
    connectedEmail: cfg?.connectedEmail,
    storageUsageBytes: cfg?.storageUsageBytes,
    storageLimitBytes: cfg?.storageLimitBytes,
    connectedAt: cfg?.connectedAt,
    lastSyncedAt: cfg?.lastSyncedAt,
    redirectUri,
  };
}

interface RemoteDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  starred?: boolean;
  shared?: boolean;
  parents?: string[];
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
  description?: string;
  modifiedTime?: string;
}

function mapRemoteDriveFile(f: RemoteDriveFile): GoogleDriveFileItem {
  return {
    id: `gdrive-${f.id}`,
    driveFileId: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink:
      f.webViewLink ||
      (f.mimeType === "application/vnd.google-apps.folder"
        ? `https://drive.google.com/drive/folders/${f.id}`
        : `https://drive.google.com/file/d/${f.id}/view`),
    webContentLink: f.webContentLink,
    size: f.size ? Number(f.size) : undefined,
    starred: Boolean(f.starred),
    shared: Boolean(f.shared),
    parentFolderId: f.parents?.[0],
    ownerName: f.owners?.[0]?.displayName,
    ownerEmail: f.owners?.[0]?.emailAddress,
    description: f.description,
    source: "google_drive_api",
    modifiedTime: f.modifiedTime || new Date().toISOString(),
  };
}

function mergeDriveFileIntoList(
  list: GoogleDriveFileItem[],
  incoming: GoogleDriveFileItem
): boolean {
  const idx = list.findIndex(
    (item) =>
      (incoming.driveFileId && item.driveFileId === incoming.driveFileId) ||
      item.id === incoming.id
  );

  if (idx >= 0) {
    const ex = list[idx];
    list[idx] = {
      ...ex,
      ...incoming,
      contentPreview: incoming.contentPreview || ex.contentPreview,
    };
    return false;
  }

  list.unshift(incoming);
  return true;
}

/**
 * Synchronizes files and storage quota from Google Drive REST API v3 (`GET /drive/v3/files` & `GET /drive/v3/about`).
 */
export async function syncGoogleDriveFiles(params?: {
  query?: string;
  folderId?: string;
  pageSize?: number;
}): Promise<{
  success: boolean;
  addedCount: number;
  updatedCount: number;
  totalFiles: number;
  error?: string;
}> {
  const token = await getValidGoogleDriveToken();
  if (!token) {
    return {
      success: false,
      addedCount: 0,
      updatedCount: 0,
      totalFiles: 0,
      error:
        "Google Drive API 인증 토큰이 없습니다. [🔑 OAuth 2.0 / Drive API 설정]에서 Google 계정을 연동하거나 토큰을 입력해 주세요.",
    };
  }

  const db = getDb();
  if (!db.googleDriveFiles) db.googleDriveFiles = [];

  try {
    // 1. Fetch Storage Quota & User Info (`GET /drive/v3/about`)
    try {
      const aboutRes = await fetch(
        `${DRIVE_API_BASE}/about?fields=user(displayName,emailAddress),storageQuota(limit,usage,usageInDrive)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (aboutRes.ok) {
        const aboutData = (await aboutRes.json()) as {
          user?: { emailAddress?: string };
          storageQuota?: { limit?: string; usage?: string };
        };
        db.settings.googleDriveConfig = {
          ...(db.settings.googleDriveConfig || {}),
          connectedEmail:
            aboutData.user?.emailAddress || db.settings.googleDriveConfig?.connectedEmail,
          storageUsageBytes: aboutData.storageQuota?.usage
            ? Number(aboutData.storageQuota.usage)
            : undefined,
          storageLimitBytes: aboutData.storageQuota?.limit
            ? Number(aboutData.storageQuota.limit)
            : undefined,
        };
      }
    } catch {
      // ignore about error
    }

    // 2. Fetch Files (`GET /drive/v3/files`)
    const qParts = ["trashed = false"];
    if (params?.folderId) {
      qParts.push(`'${params.folderId}' in parents`);
    }
    if (params?.query && params.query.trim()) {
      const escaped = params.query.trim().replace(/'/g, "\\'");
      qParts.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
    }

    const filesUrl = new URL(`${DRIVE_API_BASE}/files`);
    filesUrl.searchParams.set("pageSize", String(params?.pageSize || 100));
    filesUrl.searchParams.set("q", qParts.join(" and "));
    filesUrl.searchParams.set("orderBy", "modifiedTime desc");
    filesUrl.searchParams.set(
      "fields",
      "files(id,name,mimeType,webViewLink,webContentLink,size,starred,shared,parents,owners(displayName,emailAddress),description,modifiedTime)"
    );

    const filesRes = await fetch(filesUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!filesRes.ok) {
      const errText = await filesRes.text();
      return {
        success: false,
        addedCount: 0,
        updatedCount: 0,
        totalFiles: db.googleDriveFiles.length,
        error: `Google Drive API 조회 실패 (HTTP ${filesRes.status}): ${errText.slice(0, 150)}`,
      };
    }

    const filesData = (await filesRes.json()) as { files?: RemoteDriveFile[] };
    let addedCount = 0;
    let updatedCount = 0;

    for (const rf of filesData.files || []) {
      const mapped = mapRemoteDriveFile(rf);
      if (mergeDriveFileIntoList(db.googleDriveFiles, mapped)) {
        addedCount++;
      } else {
        updatedCount++;
      }
    }

    if (db.settings.googleDriveConfig) {
      db.settings.googleDriveConfig.lastSyncedAt = new Date().toISOString();
    }
    saveDb(db);

    return {
      success: true,
      addedCount,
      updatedCount,
      totalFiles: db.googleDriveFiles.length,
    };
  } catch (err) {
    return {
      success: false,
      addedCount: 0,
      updatedCount: 0,
      totalFiles: db.googleDriveFiles.length,
      error: err instanceof Error ? err.message : "Drive API 동기화 중 오류 발생",
    };
  }
}

/**
 * Local filtering & search across Drive files.
 */
export function listOrSearchDriveFiles(options?: {
  query?: string;
  mimeCategory?: "all" | "doc" | "sheet" | "slide" | "hwp" | "folder" | "pdf_other";
  starredOnly?: boolean;
  folderId?: string;
}): GoogleDriveFileItem[] {
  const db = getDb();
  if (!db.googleDriveFiles) db.googleDriveFiles = [];
  if (!db.googleDriveFiles.some((f) => isHwpFile(f.name, f.mimeType))) {
    db.googleDriveFiles.unshift(
      {
        id: "gdrive-sample-hwpx",
        name: "2026년_Junior_AI에이전트_도입기획서.hwpx",
        mimeType: "application/vnd.hancom.hwpx",
        size: 24576,
        starred: true,
        shared: false,
        description: "크롬 rhwp 확장프로그램으로 열람·편집 가능한 한글 표준 문서 (.hwpx)",
        contentPreview:
          "1. 추진 배경 및 목적\n- 개인 전담 AI 비서 Junior를 통한 Gmail, Google 주소록, Google Chat, Google Drive 통합 업무 자동화 구축\n\n2. 주요 기능 범위\n- 한글 문서(.hwp / .hwpx) 크롬 rhwp 확장프로그램 연동 본문 열람 및 실시간 편집\n- AI 3줄 요약 및 Google Chat 스페이스 즉시 공유",
        source: "local_workspace",
        modifiedTime: new Date().toISOString(),
      },
      {
        id: "gdrive-sample-hwp",
        name: "주간업무보고서_제임스.hwp",
        mimeType: "application/x-hwp",
        size: 18432,
        starred: false,
        shared: true,
        description: "크롬 rhwp 확장프로그램 연동 한글 문서 (.hwp)",
        contentPreview:
          "[주간 업무 보고서]\n작성자: 사용자\n주요 성과:\n1) Google Service 설정 통합 메뉴 개편 완료\n2) Google Drive OAuth 2.0 및 크롬 rhwp 확장프로그램(.hwp/.hwpx) 본문/편집 연동 완료",
        source: "local_workspace",
        modifiedTime: new Date(Date.now() - 3600_000).toISOString(),
      }
    );
    saveDb(db);
  }
  let files = [...(db.googleDriveFiles || [])];

  if (options?.starredOnly) {
    files = files.filter((f) => f.starred);
  }

  if (options?.folderId) {
    files = files.filter((f) => f.parentFolderId === options.folderId);
  }

  if (options?.mimeCategory && options.mimeCategory !== "all") {
    files = files.filter((f) => {
      const m = f.mimeType.toLowerCase();
      switch (options.mimeCategory) {
        case "doc":
          return (
            !isHwpFile(f.name, f.mimeType) &&
            (m.includes("google-apps.document") ||
              m.includes("text/") ||
              m.includes("markdown"))
          );
        case "sheet":
          return m.includes("google-apps.spreadsheet") || m.includes("csv") || m.includes("excel");
        case "slide":
          return m.includes("google-apps.presentation");
        case "hwp":
          return isHwpFile(f.name, f.mimeType);
        case "folder":
          return m.includes("google-apps.folder");
        case "pdf_other":
          return (
            !m.includes("google-apps.document") &&
            !m.includes("google-apps.spreadsheet") &&
            !m.includes("google-apps.presentation") &&
            !m.includes("google-apps.folder") &&
            !isHwpFile(f.name, f.mimeType)
          );
        default:
          return true;
      }
    });
  }

  if (options?.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    files = files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q)) ||
        (f.contentPreview && f.contentPreview.toLowerCase().includes(q))
    );
  }

  files.sort(
    (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
  );
  return files;
}

/**
 * Resolves a Drive file by ID, driveFileId, or name.
 */
export function resolveDriveFile(fileIdOrName: string): GoogleDriveFileItem | null {
  const db = getDb();
  const files = db.googleDriveFiles || [];
  const q = fileIdOrName.trim().toLowerCase();

  return (
    files.find(
      (f) =>
        f.id.toLowerCase() === q ||
        (f.driveFileId && f.driveFileId.toLowerCase() === q) ||
        f.name.toLowerCase() === q ||
        f.name.toLowerCase().includes(q)
    ) || null
  );
}

/**
 * Reads the text content of a Google Doc, Sheet, Slide, or Text/Markdown file from Google Drive API v3 (or local cache).
 */
export async function readDriveFileContent(fileIdOrName: string): Promise<{
  success: boolean;
  file?: GoogleDriveFileItem;
  content?: string;
  error?: string;
}> {
  let file = resolveDriveFile(fileIdOrName);
  const token = await getValidGoogleDriveToken();

  // If not found locally and we have a token, try searching Drive API first
  if (!file && token) {
    await syncGoogleDriveFiles({ query: fileIdOrName, pageSize: 10 });
    file = resolveDriveFile(fileIdOrName);
  }

  if (!file) {
    return {
      success: false,
      error: `'${fileIdOrName}' 파일을 찾을 수 없습니다.`,
    };
  }

  // If we already have local content and no remote token (or local file), return cached content
  if (!token || !file.driveFileId) {
    if (file.contentPreview) {
      return {
        success: true,
        file,
        content: file.contentPreview,
      };
    }
    return {
      success: false,
      file,
      error: "이 파일의 본문을 읽으려면 Google Drive OAuth 2.0 또는 REST API 토큰이 필요합니다.",
    };
  }

  try {
    let url = "";
    const mime = file.mimeType;

    if (
      mime === "application/vnd.google-apps.document" ||
      mime === "application/vnd.google-apps.presentation"
    ) {
      url = `${DRIVE_API_BASE}/files/${file.driveFileId}/export?mimeType=text/plain`;
    } else if (mime === "application/vnd.google-apps.spreadsheet") {
      url = `${DRIVE_API_BASE}/files/${file.driveFileId}/export?mimeType=text/csv`;
    } else if (mime === "application/vnd.google-apps.folder") {
      return {
        success: false,
        file,
        error: `'${file.name}'은(는) 폴더입니다. 폴더 내부 파일 목록은 list_files로 조회할 수 있습니다.`,
      };
    } else {
      url = `${DRIVE_API_BASE}/files/${file.driveFileId}?alt=media`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (file.contentPreview) {
        return { success: true, file, content: file.contentPreview };
      }
      const errText = await res.text();
      return {
        success: false,
        file,
        error: `파일 본문 읽기 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
      };
    }

    const arrayBuf = await res.arrayBuffer();
    const rawBuf = Buffer.from(arrayBuf);
    const text = isHwpFile(file.name, file.mimeType)
      ? extractReadableTextFromHwpBuffer(rawBuf, file.name)
      : rawBuf.toString("utf-8");
    const trimmedContent = text.slice(0, 15000);

    // Cache preview in DB
    const db = getDb();
    const target = db.googleDriveFiles?.find((f) => f.id === file?.id);
    if (target) {
      target.contentPreview = trimmedContent.slice(0, 4000);
      saveDb(db);
    }

    return {
      success: true,
      file,
      content: trimmedContent,
    };
  } catch (err) {
    if (file.contentPreview) {
      return { success: true, file, content: file.contentPreview };
    }
    return {
      success: false,
      file,
      error: err instanceof Error ? err.message : "파일 읽기 중 오류 발생",
    };
  }
}

/**
 * Fetches the raw binary Buffer of a Drive file (especially `.hwp` / `.hwpx`) for streaming to the Chrome `rhwp` extension.
 */
export async function getRawDriveFileBuffer(fileIdOrName: string): Promise<{
  success: boolean;
  file?: GoogleDriveFileItem;
  buffer?: Buffer;
  contentType?: string;
  error?: string;
}> {
  const file = resolveDriveFile(fileIdOrName);
  if (!file) {
    return {
      success: false,
      error: `'${fileIdOrName}' 파일을 찾을 수 없습니다.`,
    };
  }

  const lowerName = file.name.toLowerCase();
  const isHwpx = lowerName.endsWith(".hwpx") || file.mimeType.toLowerCase().includes("hwpx");
  const isHwp = isHwpFile(file.name, file.mimeType);
  const contentType = isHwpx
    ? "application/vnd.hancom.hwpx"
    : isHwp
    ? "application/x-hwp"
    : file.mimeType || "application/octet-stream";

  const token = await getValidGoogleDriveToken();
  if (token && file.driveFileId) {
    try {
      const res = await fetch(`${DRIVE_API_BASE}/files/${file.driveFileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return {
          success: true,
          file,
          buffer: Buffer.from(ab),
          contentType,
        };
      }
    } catch {
      // fallback to local preview buffer below
    }
  }

  const fallbackText =
    file.contentPreview ||
    `[한글 문서 (${file.name})]\n본문 내용이 비어 있거나 로컬 워크스페이스 문서입니다.`;
  return {
    success: true,
    file,
    buffer: Buffer.from(fallbackText, "utf-8"),
    contentType,
  };
}

/**
 * Creates a new Google Doc, Google Sheet, Folder, HWP/HWPX, or Markdown/Text file in Google Drive (`POST /upload/drive/v3/files?uploadType=multipart`).
 */
export async function createDriveFileOrDoc(params: {
  name: string;
  content?: string;
  docType?:
    | "google_doc"
    | "google_sheet"
    | "google_slide"
    | "hwp"
    | "hwpx"
    | "folder"
    | "markdown"
    | "text";
  parentFolderId?: string;
  description?: string;
}): Promise<{
  success: boolean;
  file?: GoogleDriveFileItem;
  cloudSynced: boolean;
  error?: string;
}> {
  let cleanName = params.name.trim();
  if (!cleanName) {
    return {
      success: false,
      cloudSynced: false,
      error: "생성할 파일 또는 폴더 이름을 입력해 주세요.",
    };
  }

  let targetMime = "application/vnd.google-apps.document";
  let uploadContentType = "text/plain; charset=UTF-8";

  switch (params.docType) {
    case "google_doc":
      targetMime = "application/vnd.google-apps.document";
      uploadContentType = "text/plain; charset=UTF-8";
      break;
    case "google_sheet":
      targetMime = "application/vnd.google-apps.spreadsheet";
      uploadContentType = "text/csv; charset=UTF-8";
      break;
    case "google_slide":
      targetMime = "application/vnd.google-apps.presentation";
      uploadContentType = "text/plain; charset=UTF-8";
      break;
    case "hwp":
      targetMime = "application/x-hwp";
      uploadContentType = "application/x-hwp";
      if (!/\.hwp$/i.test(cleanName)) cleanName = `${cleanName}.hwp`;
      break;
    case "hwpx":
      targetMime = "application/vnd.hancom.hwpx";
      uploadContentType = "application/vnd.hancom.hwpx";
      if (!/\.hwpx$/i.test(cleanName)) cleanName = `${cleanName}.hwpx`;
      break;
    case "folder":
      targetMime = "application/vnd.google-apps.folder";
      break;
    case "markdown":
      targetMime = "text/markdown";
      uploadContentType = "text/markdown; charset=UTF-8";
      break;
    case "text":
      targetMime = "text/plain";
      uploadContentType = "text/plain; charset=UTF-8";
      break;
    default:
      if (/\.hwpx$/i.test(cleanName)) {
        targetMime = "application/vnd.hancom.hwpx";
        uploadContentType = "application/vnd.hancom.hwpx";
      } else if (/\.hwp$/i.test(cleanName)) {
        targetMime = "application/x-hwp";
        uploadContentType = "application/x-hwp";
      } else {
        targetMime = "application/vnd.google-apps.document";
      }
      break;
  }

  const token = await getValidGoogleDriveToken();
  const db = getDb();
  if (!db.googleDriveFiles) db.googleDriveFiles = [];

  if (token) {
    try {
      const metadata: Record<string, unknown> = {
        name: cleanName,
        mimeType: targetMime,
        ...(params.description ? { description: params.description.trim() } : {}),
        ...(params.parentFolderId ? { parents: [params.parentFolderId] } : {}),
      };

      let res: Response;
      if (targetMime === "application/vnd.google-apps.folder" || !params.content) {
        res = await fetch(
          `${DRIVE_API_BASE}/files?fields=id,name,mimeType,webViewLink,webContentLink,size,starred,shared,parents,description,modifiedTime`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(metadata),
          }
        );
      } else {
        const boundary = `junior_drive_boundary_${Date.now()}`;
        const multipartBody = [
          `--${boundary}`,
          "Content-Type: application/json; charset=UTF-8",
          "",
          JSON.stringify(metadata),
          `--${boundary}`,
          `Content-Type: ${uploadContentType}`,
          "",
          params.content,
          `--${boundary}--`,
        ].join("\r\n");

        res = await fetch(
          `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,size,starred,shared,parents,description,modifiedTime`,
          {
            method: "POST",
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
              Authorization: `Bearer ${token}`,
            },
            body: multipartBody,
          }
        );
      }

      if (res.ok) {
        const createdRemote = (await res.json()) as RemoteDriveFile;
        const mapped = mapRemoteDriveFile(createdRemote);
        mapped.contentPreview = params.content?.slice(0, 4000);
        mergeDriveFileIntoList(db.googleDriveFiles, mapped);
        saveDb(db);

        return {
          success: true,
          file: mapped,
          cloudSynced: true,
        };
      }
    } catch {
      // Fallback to local workspace creation below
    }
  }

  // Local Workspace Fallback (works even before OAuth is configured)
  const localItem: GoogleDriveFileItem = {
    id: generateId(),
    name: cleanName,
    mimeType: targetMime,
    size: params.content ? Buffer.byteLength(params.content, "utf-8") : 0,
    starred: false,
    shared: false,
    parentFolderId: params.parentFolderId,
    description: params.description,
    contentPreview: params.content,
    source: "local_workspace",
    modifiedTime: new Date().toISOString(),
  };

  db.googleDriveFiles.unshift(localItem);
  saveDb(db);

  return {
    success: true,
    file: localItem,
    cloudSynced: false,
  };
}

/**
 * Updates a Google Drive file's metadata (name, starred, description) or text content.
 */
export async function updateDriveFile(params: {
  fileIdOrName: string;
  newName?: string;
  content?: string;
  starred?: boolean;
  description?: string;
}): Promise<{
  success: boolean;
  file?: GoogleDriveFileItem;
  cloudSynced: boolean;
  error?: string;
}> {
  const file = resolveDriveFile(params.fileIdOrName);
  if (!file) {
    return {
      success: false,
      cloudSynced: false,
      error: `'${params.fileIdOrName}' 파일을 찾을 수 없습니다.`,
    };
  }

  const token = await getValidGoogleDriveToken();
  let cloudSynced = false;

  if (token && file.driveFileId) {
    try {
      const metaPatch: Record<string, unknown> = {};
      if (params.newName !== undefined) metaPatch.name = params.newName.trim();
      if (params.starred !== undefined) metaPatch.starred = params.starred;
      if (params.description !== undefined) metaPatch.description = params.description.trim();

      if (Object.keys(metaPatch).length > 0) {
        const res = await fetch(`${DRIVE_API_BASE}/files/${file.driveFileId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(metaPatch),
        });
        if (res.ok) cloudSynced = true;
      }

      if (params.content !== undefined) {
        const mediaRes = await fetch(
          `${DRIVE_UPLOAD_BASE}/files/${file.driveFileId}?uploadType=media`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "text/plain; charset=UTF-8",
              Authorization: `Bearer ${token}`,
            },
            body: params.content,
          }
        );
        if (mediaRes.ok) cloudSynced = true;
      }
    } catch {
      // ignore remote error
    }
  }

  const db = getDb();
  const target = db.googleDriveFiles?.find((f) => f.id === file.id);
  if (target) {
    if (params.newName !== undefined) target.name = params.newName.trim();
    if (params.starred !== undefined) target.starred = params.starred;
    if (params.description !== undefined) target.description = params.description.trim();
    if (params.content !== undefined) target.contentPreview = params.content;
    target.modifiedTime = new Date().toISOString();
    saveDb(db);
  }

  return {
    success: true,
    file: target || file,
    cloudSynced,
  };
}

/**
 * Shares a Google Drive file with an email address or enables public link sharing (`POST /drive/v3/files/{fileId}/permissions`).
 */
export async function shareDriveFile(params: {
  fileIdOrName: string;
  email?: string;
  role?: "reader" | "commenter" | "writer";
  makePublicLink?: boolean;
}): Promise<{
  success: boolean;
  file?: GoogleDriveFileItem;
  webViewLink?: string;
  error?: string;
}> {
  const file = resolveDriveFile(params.fileIdOrName);
  if (!file) {
    return {
      success: false,
      error: `'${params.fileIdOrName}' 파일을 찾을 수 없습니다.`,
    };
  }

  const token = await getValidGoogleDriveToken();
  if (token && file.driveFileId) {
    try {
      const permBody: Record<string, unknown> = params.makePublicLink
        ? {
            type: "anyone",
            role: params.role || "reader",
          }
        : {
            type: "user",
            role: params.role || "reader",
            emailAddress: params.email?.trim(),
          };

      const res = await fetch(
        `${DRIVE_API_BASE}/files/${file.driveFileId}/permissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(permBody),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          file,
          error: `공유 권한 설정 실패 (HTTP ${res.status}): ${errText.slice(0, 140)}`,
        };
      }
    } catch (err) {
      return {
        success: false,
        file,
        error: err instanceof Error ? err.message : "공유 권한 설정 중 오류 발생",
      };
    }
  }

  const db = getDb();
  const target = db.googleDriveFiles?.find((f) => f.id === file.id);
  if (target) {
    target.shared = true;
    saveDb(db);
  }

  return {
    success: true,
    file: target || file,
    webViewLink:
      file.webViewLink ||
      (file.driveFileId
        ? `https://drive.google.com/file/d/${file.driveFileId}/view`
        : undefined),
  };
}

/**
 * Deletes (trashes) a Google Drive file (`PATCH /drive/v3/files/{fileId}` `{ trashed: true }`).
 */
export async function deleteDriveFile(fileIdOrName: string): Promise<{
  success: boolean;
  deleted?: GoogleDriveFileItem;
  cloudDeleted?: boolean;
  error?: string;
}> {
  const file = resolveDriveFile(fileIdOrName);
  if (!file) {
    return {
      success: false,
      error: `'${fileIdOrName}' 파일을 찾을 수 없습니다.`,
    };
  }

  const token = await getValidGoogleDriveToken();
  let cloudDeleted = false;

  if (token && file.driveFileId) {
    try {
      const res = await fetch(`${DRIVE_API_BASE}/files/${file.driveFileId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ trashed: true }),
      });
      if (res.ok) {
        cloudDeleted = true;
      }
    } catch {
      // ignore remote error
    }
  }

  const db = getDb();
  if (db.googleDriveFiles) {
    db.googleDriveFiles = db.googleDriveFiles.filter((f) => f.id !== file.id);
    saveDb(db);
  }

  return {
    success: true,
    deleted: file,
    cloudDeleted,
  };
}
