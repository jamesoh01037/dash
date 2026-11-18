import zlib from "zlib";
import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { getDb, saveDb, GmailConfig } from "./db";
import {
  extractReadableTextFromHwpBuffer,
  getValidGoogleDriveToken,
  isHwpFile,
} from "./googleDrive";

export interface ParsedEmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  extractedText: string;
}

export interface DetailedGmailMessage {
  uid: string;
  fromName: string;
  fromEmail: string;
  fromRaw: string;
  to: string;
  subject: string;
  dateIso: string;
  bodyText: string;
  isUnread: boolean;
  attachments: ParsedEmailAttachment[];
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  to?: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export function getGmailCredentials(): { email?: string; appPassword?: string } {
  const db = getDb();
  const config = db.settings.gmailConfig;

  const email = config?.email || process.env.GMAIL_USER;
  const rawPass = config?.appPassword || process.env.GMAIL_APP_PASSWORD;
  const appPassword = rawPass ? rawPass.replace(/\s+/g, "") : undefined;

  return { email, appPassword };
}

export async function verifyAndSaveGmailCredentials(
  email: string,
  appPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cleanEmail = email.trim();
  const cleanPass = appPassword.replace(/\s+/g, "");

  if (!cleanEmail || !cleanPass) {
    return { success: false, error: "이메일 주소와 16자리 앱 비밀번호가 필요합니다." };
  }

  // 1. Verify via IMAP connection
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: cleanEmail,
      pass: cleanPass,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();

    // 2. Save to DB
    const db = getDb();
    const newConfig: GmailConfig = {
      email: cleanEmail,
      appPassword: cleanPass,
      connectedAt: new Date().toISOString(),
    };
    db.settings.gmailConfig = newConfig;
    saveDb(db);

    return {
      success: true,
      message: `${cleanEmail} 계정과 성공적으로 연결되었습니다!`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gmail App Password verification failed:", err);
    return {
      success: false,
      error: `연결 실패: ${message}. Gmail 계정의 2단계 인증과 16자리 앱 비밀번호가 정확한지 확인해 주세요.`,
    };
  }
}

export function disconnectGmail() {
  const db = getDb();
  db.settings.gmailConfig = undefined;
  saveDb(db);
}

export async function listGmailMessages(
  query = "is:unread",
  maxResults = 5
): Promise<{ success: boolean; messages?: EmailSummary[]; error?: string }> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return {
      success: false,
      error: "Gmail 연동 설정이 필요합니다. Gmail 주소와 16자리 앱 비밀번호를 등록해 주세요.",
    };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const messages: EmailSummary[] = [];
      const isUnreadFilter = query.toLowerCase().includes("unread") || query === "is:unread";

      let uids: number[] = [];

      if (isUnreadFilter) {
        // Search unread messages
        const searchResult = await client.search({ seen: false });
        uids = Array.isArray(searchResult) ? searchResult : [];
      } else {
        // All messages
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (total > 0) {
          const fetchCount = Math.min(maxResults, 15);
          const startSeq = Math.max(1, total - fetchCount + 1);
          // fetch sequence numbers
          for await (const msg of client.fetch(`${startSeq}:${total}`, { envelope: true, uid: true, flags: true })) {
            uids.push(msg.uid);
          }
        }
      }

      // Take latest maxResults
      const targetUids = uids.slice(-Math.min(maxResults, 15)).reverse();

      for (const uid of targetUids) {
        for await (const msg of client.fetch(String(uid), { envelope: true, flags: true, bodyStructure: true, source: true }, { uid: true })) {
          let snippet = "";
          try {
            if (msg.source) {
              const parsed = await simpleParser(msg.source);
              snippet = (parsed.text || "").replace(/\s+/g, " ").slice(0, 150);
            }
          } catch {
            snippet = msg.envelope?.subject || "";
          }

          const fromStr = msg.envelope?.from?.[0]?.name
            ? `${msg.envelope.from[0].name} <${msg.envelope.from[0].address}>`
            : msg.envelope?.from?.[0]?.address || "";

          messages.push({
            id: String(msg.uid),
            threadId: String(msg.uid),
            from: fromStr,
            to: msg.envelope?.to?.[0]?.address || "",
            subject: msg.envelope?.subject || "(제목 없음)",
            date: msg.envelope?.date ? msg.envelope.date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "",
            snippet: snippet.trim(),
            isUnread: Boolean(msg.flags && !msg.flags.has("\\Seen")),
          });
        }
      }

      return { success: true, messages };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("listGmailMessages IMAP error:", err);
    return { success: false, error: message };
  }
}

export async function getGmailMessageDetails(
  emailId: string
): Promise<{ success: boolean; email?: { id: string; subject: string; from: string; date: string; body: string }; error?: string }> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return { success: false, error: "Gmail 계정이 연동되어 있지 않습니다." };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      let emailDetail: { id: string; subject: string; from: string; date: string; body: string } | null = null;

      for await (const msg of client.fetch(emailId, { envelope: true, source: true }, { uid: true })) {
        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          const fromStr = parsed.from?.text || msg.envelope?.from?.[0]?.address || "";
          emailDetail = {
            id: emailId,
            subject: parsed.subject || msg.envelope?.subject || "(제목 없음)",
            from: fromStr,
            date: parsed.date ? parsed.date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "",
            body: (parsed.text || parsed.html || "").trim(),
          };
          break;
        }
      }

      if (!emailDetail) {
        return { success: false, error: "해당 메일을 찾을 수 없습니다." };
      }

      return { success: true, email: emailDetail };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

export async function fetchGmailMessageAttachmentsByUid(
  emailUid: string
): Promise<{
  success: boolean;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
  error?: string;
}> {
  if (!emailUid || emailUid.startsWith("sim-email-")) {
    return { success: true, attachments: [] };
  }

  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return { success: false, attachments: [], error: "Gmail 계정이 연동되어 있지 않습니다." };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
  });

  try {
    await client.connect();
    let targetMailbox = "INBOX";
    try {
      const mailboxes = await client.list();
      const allMail = mailboxes.find((m) => m.specialUse === "\\All");
      if (allMail?.path) {
        targetMailbox = allMail.path;
      }
    } catch {
      // fallback to INBOX
    }

    const lock = await client.getMailboxLock(targetMailbox);
    try {
      for await (const msg of client.fetch(emailUid, { source: true }, { uid: true })) {
        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          const attachments = (parsed.attachments || []).map((att) => ({
            filename: att.filename || "attachment",
            contentType: att.contentType || "application/octet-stream",
            size: att.size || att.content?.length || 0,
            content: Buffer.isBuffer(att.content)
              ? att.content
              : Buffer.from(att.content || ""),
          }));
          return { success: true, attachments };
        }
      }
      return { success: true, attachments: [] };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, attachments: [], error: message };
  }
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  body: string,
  cc?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return { success: false, error: "Gmail 계정이 연동되어 있지 않습니다." };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: email,
        pass: appPassword,
      },
    });

    const senderName = getDb().settings?.userName || "Junior";
    const info = await transporter.sendMail({
      from: `"${senderName} via Junior" <${email}>`,
      to,
      ...(cc && cc.trim() ? { cc: cc.trim() } : {}),
      subject,
      text: body,
    });

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sendGmailMessage error:", err);
    return { success: false, error: message };
  }
}

export async function createGmailDraft(
  to: string,
  subject: string,
  body: string
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return { success: false, error: "Gmail 계정이 연동되어 있지 않습니다." };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();

    // Raw RFC822 message content
    const rawMessage = [
      `From: ${email}`,
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n");

    // Try finding Drafts mailbox
    let draftsMailbox = "[Gmail]/Drafts";
    const mailboxes = await client.list();
    const foundDrafts = mailboxes.find(
      (m) =>
        m.specialUse === "\\Drafts" ||
        m.path.toLowerCase().includes("draft") ||
        m.path.includes("임시")
    );
    if (foundDrafts) {
      draftsMailbox = foundDrafts.path;
    }

    const appendRes = await client.append(draftsMailbox, Buffer.from(rawMessage, "utf-8"), ["\\Draft"]);
    await client.logout();

    const draftUid = appendRes && typeof appendRes === "object" && "uid" in appendRes ? String(appendRes.uid) : "draft-created";
    return {
      success: true,
      draftId: draftUid,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("createGmailDraft error:", err);
    return { success: false, error: message };
  }
}

/**
 * Extracts readable text from an email attachment buffer (.hwp, .hwpx, .docx, .xlsx, .pptx, .pdf, .txt, .md, .csv, etc.).
 */
export function extractAttachmentDocumentText(
  buf: Buffer,
  fileName = "",
  contentType = ""
): string {
  const lowerName = fileName.toLowerCase();
  const lowerMime = contentType.toLowerCase();

  try {
    // 1. HWP / HWPX
    if (isHwpFile(fileName, contentType)) {
      return extractReadableTextFromHwpBuffer(buf, fileName);
    }

    // 2. Plain text, Markdown, CSV, JSON, HTML, XML
    if (
      /\.(txt|md|csv|json|xml|html|htm|log|tsv)$/i.test(lowerName) ||
      lowerMime.startsWith("text/") ||
      lowerMime.includes("json") ||
      lowerMime.includes("csv")
    ) {
      return buf
        .toString("utf-8")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);
    }

    // 3. Office Open XML (.docx, .xlsx, .pptx) — ZIP archive starting with PK\x03\x04
    if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      const chunks: string[] = [];
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
          entryName.endsWith(".xml") &&
          (entryName.includes("document") ||
            entryName.includes("sharedStrings") ||
            entryName.includes("slide") ||
            entryName.includes("section"))
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
              const xmlText = decompressed
                .toString("utf-8")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (xmlText) chunks.push(xmlText);
            }
          } catch {
            // ignore entry decompression error
          }
        }
        offset = dataEnd;
      }
      if (chunks.length > 0) {
        return chunks.join("\n").slice(0, 6000);
      }
    }

    // 4. PDF or other binary documents — extract readable Korean/ASCII text runs
    const utf8Text = buf.toString("utf-8");
    const matches = utf8Text.match(/[가-힣a-zA-Z0-9\s.,!?()[\]\-_~:;'"/@#$%^&*+=]{10,}/g);
    if (matches && matches.length > 0) {
      const cleaned = matches
        .map((s) => s.trim())
        .filter(
          (s) =>
            s.length >= 6 &&
            !/^(obj|endobj|stream|endstream|xref|trailer|startxref)$/i.test(s) &&
            /[가-힣a-zA-Z]{3,}/.test(s)
        )
        .slice(0, 60)
        .join("\n");
      if (cleaned) return cleaned.slice(0, 5000);
    }

    return `첨부 문서 (${fileName}, ${(buf.byteLength / 1024).toFixed(1)}KB)`;
  } catch {
    return `첨부 문서 (${fileName})`;
  }
}

function decodeBase64Url(data?: string | null): Buffer {
  if (!data) return Buffer.alloc(0);
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64");
}

function parseFromHeader(raw: string): { name: string; email: string } {
  const trimmed = (raw || "").trim();
  const match = trimmed.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: (match[1] || "").trim() || match[2].trim(),
      email: match[2].trim(),
    };
  }
  return { name: trimmed || "알 수 없음", email: trimmed };
}

async function fetchRecentGmailMessagesViaOAuth(
  maxResults = 20,
  scope: "all_except_spam" | "inbox_only" = "all_except_spam"
): Promise<{
  success: boolean;
  messages: DetailedGmailMessage[];
  error?: string;
}> {
  const accessToken = await getValidGoogleDriveToken();
  if (!accessToken) {
    return {
      success: false,
      messages: [],
      error: "Google OAuth 계정이 연동되어 있지 않습니다.",
    };
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: "v1", auth });

    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults,
      ...(scope === "inbox_only"
        ? { labelIds: ["INBOX"], q: "-in:sent -in:drafts" }
        : { q: "-in:spam -in:trash -in:sent -in:drafts" }),
    });
    const listItems = listRes.data.messages || [];
    const results: DetailedGmailMessage[] = [];

    for (const item of listItems) {
      if (!item.id) continue;
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: item.id,
        format: "full",
      });
      const payload = msgRes.data.payload;
      const headers = payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      const fromRaw = getHeader("From");
      const parsedFrom = parseFromHeader(fromRaw);
      const to = getHeader("To");
      const subject = getHeader("Subject") || "(제목 없음)";
      const dateStr = getHeader("Date");
      const dateIso = dateStr
        ? new Date(dateStr).toISOString()
        : msgRes.data.internalDate
          ? new Date(Number(msgRes.data.internalDate)).toISOString()
          : new Date().toISOString();
      const isUnread = Boolean(msgRes.data.labelIds?.includes("UNREAD"));

      let plainText = "";
      let htmlText = "";
      const attachments: ParsedEmailAttachment[] = [];

      const walkParts = async (part: typeof payload) => {
        if (!part) return;
        const mime = (part.mimeType || "").toLowerCase();
        const filename = part.filename || "";

        if (filename && (part.body?.attachmentId || part.body?.data)) {
          let buf: Buffer = Buffer.alloc(0);
          if (part.body?.data) {
            buf = decodeBase64Url(part.body.data);
          } else if (part.body?.attachmentId) {
            try {
              const attRes = await gmail.users.messages.attachments.get({
                userId: "me",
                messageId: item.id!,
                id: part.body.attachmentId,
              });
              buf = decodeBase64Url(attRes.data.data);
            } catch {
              // ignore attachment download error
            }
          }
          const extractedText =
            buf.byteLength > 0
              ? extractAttachmentDocumentText(buf, filename, mime)
              : `첨부 문서 (${filename})`;
          attachments.push({
            filename,
            contentType: mime || "application/octet-stream",
            size: part.body?.size || buf.byteLength,
            extractedText,
          });
        } else if (mime === "text/plain" && part.body?.data && !plainText) {
          plainText = decodeBase64Url(part.body.data).toString("utf8");
        } else if (mime === "text/html" && part.body?.data && !htmlText) {
          htmlText = decodeBase64Url(part.body.data).toString("utf8");
        }

        if (part.parts) {
          for (const child of part.parts) {
            await walkParts(child);
          }
        }
      };

      await walkParts(payload);
      const bodyText = (
        plainText ||
        htmlText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      )
        .trim()
        .slice(0, 6000);

      results.push({
        uid: item.id,
        fromName: parsedFrom.name,
        fromEmail: parsedFrom.email,
        fromRaw: fromRaw || parsedFrom.email,
        to,
        subject,
        dateIso,
        bodyText,
        isUnread,
        attachments,
      });
    }

    return { success: true, messages: results };
  } catch (err) {
    return {
      success: false,
      messages: [],
      error: err instanceof Error ? err.message : "Gmail OAuth 조회 실패",
    };
  }
}

/**
 * Fetches recent unread/incoming Gmail messages along with parsed attachment text.
 */
export async function fetchRecentGmailMessagesWithAttachments(
  maxResults = 20,
  scope: "all_except_spam" | "inbox_only" = "all_except_spam"
): Promise<{
  success: boolean;
  messages: DetailedGmailMessage[];
  error?: string;
}> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return fetchRecentGmailMessagesViaOAuth(maxResults, scope);
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    let targetMailbox = "INBOX";
    if (scope === "all_except_spam") {
      try {
        const mailboxes = await client.list();
        const allMailBox = mailboxes.find(
          (m) =>
            m.specialUse === "\\All" ||
            m.path === "[Gmail]/All Mail" ||
            m.path === "[Gmail]/전체보관함"
        );
        if (allMailBox?.path) {
          targetMailbox = allMailBox.path;
        }
      } catch {
        targetMailbox = "INBOX";
      }
    }

    const lock = await client.getMailboxLock(targetMailbox);

    try {
      const searchResult = await client.search({ all: true }, { uid: true });
      const allUids = Array.isArray(searchResult) ? searchResult : [];
      const targetUids = allUids.slice(-maxResults).reverse();

      const detailedMessages: DetailedGmailMessage[] = [];

      for (const uid of targetUids) {
        for await (const msg of client.fetch(
          String(uid),
          { envelope: true, flags: true, labels: true, source: true },
          { uid: true }
        )) {
          if (!msg.source) continue;
          const isDraft =
            Boolean(msg.flags?.has("\\Draft")) ||
            Boolean(msg.labels?.has("\\Draft"));
          const isSent = Boolean(msg.labels?.has("\\Sent"));
          const isInbox = Boolean(msg.labels?.has("\\Inbox"));
          if (isDraft || (isSent && !isInbox)) continue;

          const parsed = await simpleParser(msg.source);
          const fromName =
            parsed.from?.value?.[0]?.name ||
            msg.envelope?.from?.[0]?.name ||
            parsed.from?.value?.[0]?.address ||
            "발신자";
          const fromEmail =
            parsed.from?.value?.[0]?.address ||
            msg.envelope?.from?.[0]?.address ||
            "";
          const fromRaw = fromEmail ? `${fromName} <${fromEmail}>` : fromName;

          const attachments: ParsedEmailAttachment[] = [];
          for (const att of parsed.attachments || []) {
            // Skip tiny inline tracking images unless it's a document
            const fname = att.filename || "첨부파일";
            const ctype = att.contentType || "application/octet-stream";
            if (ctype.startsWith("image/") && (att.size || 0) < 15000) {
              continue;
            }

            const extractedText = extractAttachmentDocumentText(
              att.content,
              fname,
              ctype
            );
            attachments.push({
              filename: fname,
              contentType: ctype,
              size: att.size || att.content.byteLength,
              extractedText,
            });
          }

          detailedMessages.push({
            uid: String(msg.uid),
            fromName,
            fromEmail,
            fromRaw,
            to: msg.envelope?.to?.[0]?.address || email,
            subject: parsed.subject || msg.envelope?.subject || "(제목 없음)",
            dateIso: parsed.date
              ? new Date(parsed.date).toISOString()
              : msg.envelope?.date
              ? new Date(msg.envelope.date).toISOString()
              : new Date().toISOString(),
            bodyText: (parsed.text || parsed.html || "")
              .replace(/<[^>]+>/g, " ")
              .trim(),
            isUnread: Boolean(msg.flags && !msg.flags.has("\\Seen")),
            attachments,
          });
        }
      }

      return { success: true, messages: detailedMessages };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    return {
      success: false,
      messages: [],
      error: err instanceof Error ? err.message : "Gmail 조회 오류",
    };
  }
}

export type GmailImapActionType =
  | "spam"
  | "trash"
  | "archive"
  | "snooze"
  | "mark_read";

async function resolveUidInOpenMailbox(
  client: ImapFlow,
  emailUid: string,
  subject?: string
): Promise<string | null> {
  if (/^\d+$/.test(emailUid)) {
    const exact = await client
      .search({ uid: emailUid }, { uid: true })
      .catch(() => []);
    if (Array.isArray(exact) && exact.length > 0) {
      return String(exact[0]);
    }
  }
  if (subject?.trim()) {
    const bySubj = await client
      .search({ subject: subject.trim() }, { uid: true })
      .catch(() => []);
    if (Array.isArray(bySubj) && bySubj.length > 0) {
      return String(bySubj[bySubj.length - 1]);
    }
  }
  return null;
}

async function moveOrCopyDeleteUid(
  client: ImapFlow,
  uid: string,
  destPath: string
): Promise<void> {
  const moved = await client
    .messageMove(uid, destPath, { uid: true })
    .catch(() => false);
  if (!moved) {
    await client.messageCopy(uid, destPath, { uid: true }).catch(() => null);
    await client.messageDelete(uid, { uid: true }).catch(() => null);
  }
}

async function applyImapActionToItem(params: {
  client: ImapFlow;
  emailUid: string;
  subject?: string;
  action: GmailImapActionType;
  spamPath: string;
  trashPath: string;
  allMailPath: string;
  snoozeMailbox: string;
}): Promise<boolean> {
  const {
    client,
    emailUid,
    subject,
    action,
    spamPath,
    trashPath,
    allMailPath,
    snoozeMailbox,
  } = params;

  const inboxLock = await client.getMailboxLock("INBOX");
  let resolvedInInbox: string | null = null;
  try {
    resolvedInInbox = await resolveUidInOpenMailbox(client, emailUid, subject);
    if (resolvedInInbox) {
      switch (action) {
        case "spam":
          await moveOrCopyDeleteUid(client, resolvedInInbox, spamPath);
          return true;
        case "trash":
          await moveOrCopyDeleteUid(client, resolvedInInbox, trashPath);
          return true;
        case "archive":
          // In Gmail IMAP, deleting from INBOX removes the INBOX label while keeping the message in All Mail
          await client
            .messageDelete(resolvedInInbox, { uid: true })
            .catch(() => null);
          return true;
        case "snooze":
          await client
            .messageFlagsAdd(resolvedInInbox, ["\\Seen", "\\Flagged"], { uid: true })
            .catch(() => null);
          if (snoozeMailbox) {
            await moveOrCopyDeleteUid(client, resolvedInInbox, snoozeMailbox);
          } else {
            await client
              .messageDelete(resolvedInInbox, { uid: true })
              .catch(() => null);
          }
          return true;
        case "mark_read":
          await client
            .messageFlagsAdd(resolvedInInbox, ["\\Seen"], { uid: true })
            .catch(() => null);
          return true;
      }
    }
  } finally {
    inboxLock.release();
  }

  if (
    !resolvedInInbox &&
    allMailPath &&
    (action === "spam" || action === "trash" || action === "mark_read")
  ) {
    const allLock = await client.getMailboxLock(allMailPath);
    try {
      const resolvedInAll = await resolveUidInOpenMailbox(client, emailUid, subject);
      if (resolvedInAll) {
        if (action === "spam") {
          await moveOrCopyDeleteUid(client, resolvedInAll, spamPath);
          return true;
        }
        if (action === "trash") {
          await moveOrCopyDeleteUid(client, resolvedInAll, trashPath);
          return true;
        }
        if (action === "mark_read") {
          await client
            .messageFlagsAdd(resolvedInAll, ["\\Seen"], { uid: true })
            .catch(() => null);
          return true;
        }
      }
    } finally {
      allLock.release();
    }
  }

  return false;
}

/**
 * Executes an action (spam, trash/delete, archive, snooze, mark_read) directly on the Gmail server via IMAP.
 */
export async function performGmailImapAction(params: {
  emailUid: string;
  subject?: string;
  action: GmailImapActionType;
  snoozeLabel?: string;
}): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const { emailUid, subject, action, snoozeLabel } = params;

  // Handle simulated test emails gracefully
  if (!emailUid || emailUid.startsWith("sim-email-")) {
    const labelMap: Record<GmailImapActionType, string> = {
      spam: "🚫 Gmail 스팸함으로 이동(스팸 처리) 완료되었습니다.",
      trash: "🗑️ Gmail 휴지통으로 이동(삭제) 완료되었습니다.",
      archive: "📥 Gmail 전체보관함으로 보관처리 완료되었습니다.",
      snooze: `⏰ Gmail에서 다시알림(${snoozeLabel || "예약됨"}) 처리되었습니다.`,
      mark_read: "✅ Gmail에서도 읽음 표시되었습니다.",
    };
    return {
      success: true,
      message: labelMap[action],
    };
  }

  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return {
      success: false,
      message: "Gmail 계정이 연동되어 있지 않아 로컬 알림에서만 처리되었습니다.",
      error: "Gmail 계정 미연동",
    };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();

    const findMailboxPath = (
      specialUse: string,
      keywords: string[],
      fallback: string
    ): string => {
      const found = mailboxes.find(
        (m) =>
          m.specialUse === specialUse ||
          keywords.some((kw) => m.path.toLowerCase().includes(kw.toLowerCase()))
      );
      return found ? found.path : fallback;
    };

    const spamPath = findMailboxPath(
      "\\Junk",
      ["spam", "junk", "스팸"],
      "[Gmail]/Spam"
    );
    const trashPath = findMailboxPath(
      "\\Trash",
      ["trash", "bin", "휴지통"],
      "[Gmail]/Trash"
    );
    const allMailPath = findMailboxPath(
      "\\All",
      ["all mail", "전체보관함", "전체 메일"],
      ""
    );

    let snoozeMailbox = mailboxes.find(
      (m) =>
        m.path.toLowerCase().includes("snoozed") ||
        m.path.includes("다시 알림") ||
        m.path.includes("다시알림")
    )?.path;

    if (action === "snooze" && !snoozeMailbox) {
      try {
        await client.mailboxCreate("Snoozed");
        snoozeMailbox = "Snoozed";
      } catch {
        snoozeMailbox = allMailPath || "";
      }
    }

    try {
      await applyImapActionToItem({
        client,
        emailUid,
        subject,
        action,
        spamPath,
        trashPath,
        allMailPath,
        snoozeMailbox: snoozeMailbox || "",
      });

      const msgMap: Record<GmailImapActionType, string> = {
        spam: "🚫 Gmail에서 스팸 처리(스팸함 이동)되었습니다.",
        trash: "🗑️ Gmail에서 메일을 삭제(휴지통 이동)했습니다.",
        archive: "📥 Gmail에서 보관처리(받은편지함에서 보관)되었습니다.",
        snooze: `⏰ Gmail에서도 다시알림(${snoozeLabel || "예약됨"}) 처리되어 받은편지함에서 임시 보관되었습니다.`,
        mark_read: "✅ Gmail에서도 읽음 표시되었습니다.",
      };
      return {
        success: true,
        message: msgMap[action],
      };
    } finally {
      await client.logout();
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `로컬 알림에 반영되었으나 Gmail 서버 작업 중 오류가 발생했습니다: ${errMsg}`,
      error: errMsg,
    };
  }
}

/**
 * Restores a snoozed message back to Gmail INBOX as unread when its snooze timer expires.
 */
export async function unsnoozeGmailMessageToInbox(params: {
  subject: string;
}): Promise<boolean> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword || !params.subject) return false;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    const snoozeBox =
      mailboxes.find(
        (m) =>
          m.path.toLowerCase().includes("snoozed") ||
          m.path.includes("다시 알림") ||
          m.path.includes("다시알림")
      )?.path ||
      mailboxes.find(
        (m) =>
          m.specialUse === "\\All" ||
          m.path.toLowerCase().includes("all mail") ||
          m.path.includes("전체보관함")
      )?.path;

    if (!snoozeBox) {
      await client.logout();
      return false;
    }

    const lock = await client.getMailboxLock(snoozeBox);
    try {
      const foundUids = await client
        .search({ subject: params.subject })
        .catch(() => []);
      if (Array.isArray(foundUids) && foundUids.length > 0) {
        const targetUid = String(foundUids[foundUids.length - 1]);
        await client
          .messageFlagsRemove(targetUid, ["\\Seen"], { uid: true })
          .catch(() => null);
        await client
          .messageMove(targetUid, "INBOX", { uid: true })
          .catch(async () => {
            await client
              .messageCopy(targetUid, "INBOX", { uid: true })
              .catch(() => null);
          });
      }
      return true;
    } finally {
      lock.release();
      await client.logout();
    }
  } catch {
    return false;
  }
}

export interface BatchGmailActionItem {
  emailUid: string;
  subject?: string;
  action: GmailImapActionType;
  snoozeLabel?: string;
}

/**
 * Executes a queue of Gmail actions (spam, trash, archive, snooze, mark_read) in a single IMAP connection.
 */
export async function performBatchGmailImapActions(
  items: BatchGmailActionItem[]
): Promise<{
  success: boolean;
  processedCount: number;
  message: string;
  error?: string;
}> {
  if (!items || items.length === 0) {
    return {
      success: true,
      processedCount: 0,
      message: "처리할 대기열 항목이 없습니다.",
    };
  }

  const realItems = items.filter(
    (it) => it.emailUid && !it.emailUid.startsWith("sim-email-")
  );

  // If all items are simulated test emails, succeed immediately
  if (realItems.length === 0) {
    return {
      success: true,
      processedCount: items.length,
      message: `⚡ 큐에 담긴 이메일 작업 ${items.length}건을 한 번에 모두 처리했습니다!`,
    };
  }

  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return {
      success: false,
      processedCount: items.length,
      message: `로컬 알림 큐 ${items.length}건을 처리했습니다. (Gmail 계정 미연동)`,
      error: "Gmail 계정 미연동",
    };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();

    const findMailboxPath = (
      specialUse: string,
      keywords: string[],
      fallback: string
    ): string => {
      const found = mailboxes.find(
        (m) =>
          m.specialUse === specialUse ||
          keywords.some((kw) => m.path.toLowerCase().includes(kw.toLowerCase()))
      );
      return found ? found.path : fallback;
    };

    const spamPath = findMailboxPath(
      "\\Junk",
      ["spam", "junk", "스팸"],
      "[Gmail]/Spam"
    );
    const trashPath = findMailboxPath(
      "\\Trash",
      ["trash", "bin", "휴지통"],
      "[Gmail]/Trash"
    );
    const allMailPath = findMailboxPath(
      "\\All",
      ["all mail", "전체보관함", "전체 메일"],
      ""
    );

    let snoozeMailbox = mailboxes.find(
      (m) =>
        m.path.toLowerCase().includes("snoozed") ||
        m.path.includes("다시 알림") ||
        m.path.includes("다시알림")
    )?.path;

    const needsSnooze = realItems.some((it) => it.action === "snooze");
    if (needsSnooze && !snoozeMailbox) {
      try {
        await client.mailboxCreate("Snoozed");
        snoozeMailbox = "Snoozed";
      } catch {
        snoozeMailbox = allMailPath || "";
      }
    }

    try {
      for (const item of realItems) {
        await applyImapActionToItem({
          client,
          emailUid: item.emailUid,
          subject: item.subject,
          action: item.action,
          spamPath,
          trashPath,
          allMailPath,
          snoozeMailbox: snoozeMailbox || "",
        });
      }

      const singleMsgMap: Record<GmailImapActionType, string> = {
        spam: "🚫 Gmail에서 스팸 처리(스팸함 이동)되었습니다.",
        trash: "🗑️ Gmail에서 메일을 삭제(휴지통 이동)했습니다.",
        archive: "📥 Gmail에서 보관처리(받은편지함에서 보관)되었습니다.",
        snooze: `⏰ Gmail에서 다시알림(${realItems[0]?.snoozeLabel || "예약됨"}) 처리되었습니다.`,
        mark_read: "✅ Gmail에서도 읽음 처리되었습니다.",
      };

      return {
        success: true,
        processedCount: items.length,
        message:
          items.length === 1 && realItems[0]
            ? singleMsgMap[realItems[0].action]
            : `⚡ 이메일 작업 ${items.length}건을 Gmail과 동기화해 처리했습니다!`,
      };
    } finally {
      await client.logout();
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      processedCount: items.length,
      message: `로컬 알림 큐(${items.length}건)는 반영되었으나 Gmail 일괄 동기화 중 일부 오류가 발생했습니다: ${errMsg}`,
      error: errMsg,
    };
  }
}

