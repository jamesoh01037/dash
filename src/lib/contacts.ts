import { ImapFlow } from "imapflow";
import {
  getDb,
  saveDb,
  ContactItem,
  ContactGroupItem,
  GoogleContactsConfig,
} from "./db";
import { getGmailCredentials } from "./gmail";
import { generateId } from "./utils";

const PEOPLE_API_BASE = "https://people.googleapis.com/v1";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_CONTACTS_SCOPES = [
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/directory.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const IGNORE_EMAIL_PATTERNS = [
  /no-?reply/i,
  /donotreply/i,
  /notifications?@/i,
  /mailer-daemon/i,
  /bounce/i,
  /automated/i,
  /newsletter/i,
];

function isIgnoredEmail(address: string, ownEmail?: string): boolean {
  const clean = address.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return true;
  if (ownEmail && clean === ownEmail.trim().toLowerCase()) return true;
  return IGNORE_EMAIL_PATTERNS.some((re) => re.test(clean));
}

/**
 * Resolves OAuth 2.0 Client ID and Secret (shared across Contacts, Chat, and AppSettings).
 */
export function getGoogleContactsOAuthCredentials(): {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
} {
  const db = getDb();
  const clientId =
    db.settings.googleContactsConfig?.clientId ||
    db.settings.googleChatConfig?.clientId ||
    db.settings.googleClientId ||
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    db.settings.googleContactsConfig?.clientSecret ||
    db.settings.googleChatConfig?.clientSecret ||
    db.settings.googleClientSecret ||
    process.env.GOOGLE_CLIENT_SECRET;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/auth/google-contacts/callback`;

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generates the Google OAuth 2.0 Authorization URL for full Google People API v1 access.
 */
export function getGoogleContactsOAuthUrl(): { url?: string; error?: string } {
  const { clientId, redirectUri } = getGoogleContactsOAuthCredentials();
  if (!clientId) {
    return {
      error:
        "Google OAuth Client ID가 설정되어 있지 않습니다. [OAuth 2.0 / People API 연동 설정] 모달에서 Client ID와 Client Secret을 입력해 주세요.",
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_CONTACTS_SCOPES.join(" "),
  });

  return { url: `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}` };
}

/**
 * Exchanges an OAuth 2.0 authorization code for access_token and refresh_token.
 */
export async function exchangeGoogleContactsCodeForTokens(code: string): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleContactsOAuthCredentials();
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
    const prev = db.settings.googleContactsConfig || {};
    const updated: GoogleContactsConfig = {
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

    db.settings.googleContactsConfig = updated;
    saveDb(db);

    return { success: true, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OAuth 통신 오류";
    return { success: false, error: msg };
  }
}

/**
 * Returns a valid Google People API v1 Bearer token, automatically refreshing via OAuth 2.0 refresh_token if expired.
 */
export async function getValidGoogleContactsToken(): Promise<string | null> {
  const db = getDb();
  const cfg = db.settings.googleContactsConfig;
  const isExpired = cfg?.expiryDate ? Date.now() > cfg.expiryDate - 60_000 : false;

  if (cfg?.accessToken && !isExpired) {
    return cfg.accessToken;
  }

  if (cfg?.refreshToken) {
    const { clientId, clientSecret } = getGoogleContactsOAuthCredentials();
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
            db.settings.googleContactsConfig = {
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

  return (
    cfg?.accessToken ||
    process.env.GOOGLE_CONTACTS_ACCESS_TOKEN ||
    process.env.GOOGLE_PEOPLE_ACCESS_TOKEN ||
    null
  );
}

/**
 * Returns connection summary for the Google Contacts Hub UI.
 */
export function getGoogleContactsAuthStatus() {
  const db = getDb();
  const cfg = db.settings.googleContactsConfig;
  const { clientId, redirectUri } = getGoogleContactsOAuthCredentials();
  const { email: gmailEmail, appPassword } = getGmailCredentials();
  const hasPeopleToken = Boolean(
    cfg?.accessToken ||
      cfg?.refreshToken ||
      process.env.GOOGLE_CONTACTS_ACCESS_TOKEN
  );

  return {
    authMode: cfg?.authMode || (hasPeopleToken ? "token" : "gmail_imap"),
    hasPeopleToken,
    hasOAuthClient: Boolean(clientId),
    hasRefreshToken: Boolean(cfg?.refreshToken),
    connectedEmail: cfg?.connectedEmail || gmailEmail,
    connectedAt: cfg?.connectedAt,
    lastSyncedAt: cfg?.lastSyncedAt,
    gmailConnected: Boolean(gmailEmail && appPassword),
    redirectUri,
  };
}

/**
 * Local filtering & search across all contacts (supports query, group filter, source filter, starred filter).
 */
export function listOrSearchContacts(
  query?: string,
  options?: {
    group?: string;
    source?: string;
    starredOnly?: boolean;
  }
): ContactItem[] {
  const db = getDb();
  let contacts = [...(db.contacts || [])];

  if (options?.starredOnly) {
    contacts = contacts.filter((c) => c.starred || c.groups?.includes("starred"));
  }

  if (options?.source && options.source !== "all") {
    contacts = contacts.filter((c) => c.source === options.source);
  }

  if (options?.group && options.group !== "all") {
    const gLower = options.group.toLowerCase();
    contacts = contacts.filter((c) =>
      c.groups?.some((g) => g.toLowerCase() === gLower || g.toLowerCase().includes(gLower))
    );
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    contacts = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.role && c.role.toLowerCase().includes(q)) ||
        (c.department && c.department.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
    );
  }

  // Sort starred first, then by name
  contacts.sort((a, b) => {
    if (Boolean(a.starred) !== Boolean(b.starred)) {
      return a.starred ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "ko");
  });

  return contacts;
}

/**
 * Searches both local contacts AND live Google People API (`people:searchContacts` + `people:searchDirectoryPeople`) if People API token is active.
 */
export async function searchContactsWithPeopleApi(query: string): Promise<{
  contacts: ContactItem[];
  remoteDiscoveredCount: number;
}> {
  const token = await getValidGoogleContactsToken();
  let remoteDiscoveredCount = 0;

  if (token && query.trim()) {
    const db = getDb();
    if (!db.contacts) db.contacts = [];

    // 1. Live search in personal Google Contacts (`people:searchContacts`)
    try {
      const searchUrl = new URL(`${PEOPLE_API_BASE}/people:searchContacts`);
      searchUrl.searchParams.set("query", query.trim());
      searchUrl.searchParams.set(
        "readMask",
        "names,emailAddresses,phoneNumbers,organizations,biographies,photos"
      );
      searchUrl.searchParams.set("pageSize", "20");

      const res = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ person?: GooglePersonResource }>;
        };
        for (const r of data.results || []) {
          if (!r.person) continue;
          const mapped = mapGooglePersonToContactItem(r.person, "google_people_api");
          if (mapped && mergePersonIntoDbList(db.contacts, mapped)) {
            remoteDiscoveredCount++;
          }
        }
      }
    } catch {
      // ignore
    }

    // 2. Live search in Google Workspace Organization Directory (`people:searchDirectoryPeople`)
    try {
      const dirUrl = new URL(`${PEOPLE_API_BASE}/people:searchDirectoryPeople`);
      dirUrl.searchParams.set("query", query.trim());
      dirUrl.searchParams.set(
        "readMask",
        "names,emailAddresses,phoneNumbers,organizations,photos"
      );
      dirUrl.searchParams.set("sources", "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE");
      dirUrl.searchParams.set("pageSize", "15");

      const res = await fetch(dirUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          people?: GooglePersonResource[];
        };
        for (const p of data.people || []) {
          const mapped = mapGooglePersonToContactItem(p, "google_directory");
          if (mapped && mergePersonIntoDbList(db.contacts, mapped)) {
            remoteDiscoveredCount++;
          }
        }
      }
    } catch {
      // ignore
    }

    if (remoteDiscoveredCount > 0) {
      saveDb(db);
    }
  }

  return {
    contacts: listOrSearchContacts(query),
    remoteDiscoveredCount,
  };
}

interface GooglePersonResource {
  resourceName?: string;
  etag?: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value?: string }>;
  phoneNumbers?: Array<{ value?: string }>;
  organizations?: Array<{ name?: string; title?: string; department?: string }>;
  biographies?: Array<{ value?: string }>;
  photos?: Array<{ url?: string }>;
  memberships?: Array<{
    contactGroupMembership?: { contactGroupId?: string; contactGroupResourceName?: string };
  }>;
}

function mapGooglePersonToContactItem(
  person: GooglePersonResource,
  source: ContactItem["source"] = "google_people_api",
  groupNameMap?: Map<string, string>
): ContactItem | null {
  const email = person.emailAddresses?.[0]?.value?.trim() || "";
  const rawName =
    person.names?.[0]?.displayName?.trim() ||
    `${person.names?.[0]?.familyName || ""} ${person.names?.[0]?.givenName || ""}`.trim() ||
    (email ? email.split("@")[0] : "");

  const phone = person.phoneNumbers?.[0]?.value?.trim();
  if (!rawName && !email && !phone) return null;

  const org = person.organizations?.[0];
  const notes = person.biographies?.[0]?.value?.trim();
  const photoUrl = person.photos?.[0]?.url;

  const groups: string[] = [];
  let starred = false;

  for (const m of person.memberships || []) {
    const cgId = m.contactGroupMembership?.contactGroupId;
    const cgRes = m.contactGroupMembership?.contactGroupResourceName;
    if (cgId === "starred" || cgRes === "contactGroups/starred") {
      starred = true;
      groups.push("starred");
    } else if (cgRes && groupNameMap?.has(cgRes)) {
      groups.push(groupNameMap.get(cgRes)!);
    } else if (cgId && cgId !== "myContacts") {
      groups.push(cgId);
    }
  }

  return {
    id: generateId(),
    resourceName: person.resourceName,
    etag: person.etag,
    name: rawName || "이름 없음",
    email,
    phone,
    company: org?.name?.trim(),
    role: org?.title?.trim(),
    department: org?.department?.trim(),
    notes,
    photoUrl,
    groups: groups.length > 0 ? groups : undefined,
    starred,
    source,
    updatedAt: new Date().toISOString(),
  };
}

function mergePersonIntoDbList(list: ContactItem[], incoming: ContactItem): boolean {
  const emailLower = incoming.email.trim().toLowerCase();
  const existingIdx = list.findIndex(
    (c) =>
      (incoming.resourceName && c.resourceName === incoming.resourceName) ||
      (emailLower && c.email.toLowerCase() === emailLower)
  );

  if (existingIdx >= 0) {
    const ex = list[existingIdx];
    list[existingIdx] = {
      ...ex,
      resourceName: incoming.resourceName || ex.resourceName,
      etag: incoming.etag || ex.etag,
      name: incoming.name || ex.name,
      email: incoming.email || ex.email,
      phone: incoming.phone || ex.phone,
      company: incoming.company || ex.company,
      role: incoming.role || ex.role,
      department: incoming.department || ex.department,
      notes: incoming.notes || ex.notes,
      photoUrl: incoming.photoUrl || ex.photoUrl,
      groups: incoming.groups || ex.groups,
      starred: incoming.starred ?? ex.starred,
      source:
        incoming.source === "google_people_api" ? "google_people_api" : ex.source,
      updatedAt: new Date().toISOString(),
    };
    return false; // updated existing
  }

  list.unshift(incoming);
  return true; // newly added
}

/**
 * Full Cloud Synchronization with Google People API v1:
 * 1) `GET /v1/contactGroups` (Contact labels/groups)
 * 2) `GET /v1/people/me/connections` (My Contacts)
 * 3) `GET /v1/otherContacts` (Other Contacts)
 */
export async function syncGooglePeopleApiContacts(includeOtherContacts = true): Promise<{
  success: boolean;
  addedCount: number;
  updatedCount: number;
  totalContacts: number;
  groupsCount: number;
  error?: string;
}> {
  const token = await getValidGoogleContactsToken();
  if (!token) {
    return {
      success: false,
      addedCount: 0,
      updatedCount: 0,
      totalContacts: 0,
      groupsCount: 0,
      error:
        "Google People API 인증 토큰이 없습니다. [🔑 OAuth 2.0 / People API 전체 연동 설정]에서 계정을 연동하거나 Bearer 토큰을 입력해 주세요.",
    };
  }

  const db = getDb();
  if (!db.contacts) db.contacts = [];
  if (!db.contactGroups) db.contactGroups = [];

  const groupNameMap = new Map<string, string>();
  let addedCount = 0;
  let updatedCount = 0;

  try {
    // 1. Sync Contact Groups (`GET /v1/contactGroups`)
    const groupsRes = await fetch(`${PEOPLE_API_BASE}/contactGroups?pageSize=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (groupsRes.ok) {
      const groupsData = (await groupsRes.json()) as {
        contactGroups?: Array<{
          resourceName: string;
          name?: string;
          formattedName?: string;
          memberCount?: number;
          groupType?: string;
        }>;
      };
      const syncedGroups: ContactGroupItem[] = [];
      for (const g of groupsData.contactGroups || []) {
        const displayName = g.formattedName || g.name || g.resourceName;
        groupNameMap.set(g.resourceName, displayName);
        syncedGroups.push({
          id: g.resourceName,
          resourceName: g.resourceName,
          name: displayName,
          memberCount: g.memberCount,
          groupType: g.groupType,
        });
      }
      db.contactGroups = syncedGroups;
    }

    // 2. Sync Main Connections (`GET /v1/people/me/connections`)
    const connUrl = new URL(`${PEOPLE_API_BASE}/people/me/connections`);
    connUrl.searchParams.set(
      "personFields",
      "names,emailAddresses,phoneNumbers,organizations,biographies,photos,memberships,metadata"
    );
    connUrl.searchParams.set("pageSize", "500");

    const connRes = await fetch(connUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!connRes.ok) {
      const errText = await connRes.text();
      return {
        success: false,
        addedCount: 0,
        updatedCount: 0,
        totalContacts: db.contacts.length,
        groupsCount: db.contactGroups.length,
        error: `Google People API 조회 실패 (HTTP ${connRes.status}): ${errText.slice(0, 150)}`,
      };
    }

    const connData = (await connRes.json()) as {
      connections?: GooglePersonResource[];
    };

    for (const person of connData.connections || []) {
      const mapped = mapGooglePersonToContactItem(
        person,
        "google_people_api",
        groupNameMap
      );
      if (!mapped) continue;
      if (mergePersonIntoDbList(db.contacts, mapped)) {
        addedCount++;
      } else {
        updatedCount++;
      }
    }

    // 3. Sync Other Contacts (`GET /v1/otherContacts`) if requested
    if (includeOtherContacts) {
      try {
        const otherUrl = new URL(`${PEOPLE_API_BASE}/otherContacts`);
        otherUrl.searchParams.set("readMask", "names,emailAddresses,phoneNumbers");
        otherUrl.searchParams.set("pageSize", "300");

        const otherRes = await fetch(otherUrl.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (otherRes.ok) {
          const otherData = (await otherRes.json()) as {
            otherContacts?: GooglePersonResource[];
          };
          for (const person of otherData.otherContacts || []) {
            const mapped = mapGooglePersonToContactItem(person, "google_other");
            if (!mapped) continue;
            if (mergePersonIntoDbList(db.contacts, mapped)) {
              addedCount++;
            }
          }
        }
      } catch {
        // otherContacts scope might not be granted on some tokens; ignore gracefully
      }
    }

    if (db.settings.googleContactsConfig) {
      db.settings.googleContactsConfig.lastSyncedAt = new Date().toISOString();
    }
    saveDb(db);

    return {
      success: true,
      addedCount,
      updatedCount,
      totalContacts: db.contacts.length,
      groupsCount: db.contactGroups.length,
    };
  } catch (err) {
    return {
      success: false,
      addedCount,
      updatedCount,
      totalContacts: db.contacts.length,
      groupsCount: db.contactGroups.length,
      error: err instanceof Error ? err.message : "People API 동기화 중 오류 발생",
    };
  }
}

/**
 * Creates or updates a contact locally AND synchronizes two-way with Google People API v1 (`people:createContact` / `people:updateContact`) when authenticated!
 */
export async function upsertContactWithCloudSync(input: {
  id?: string;
  resourceName?: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  department?: string;
  notes?: string;
  groups?: string[];
  starred?: boolean;
  source?: ContactItem["source"];
  syncCloud?: boolean;
}): Promise<{
  contact: ContactItem;
  cloudSynced: boolean;
  cloudError?: string;
}> {
  const localContact = upsertContact(input);
  const shouldSyncCloud = input.syncCloud !== false;
  const token = shouldSyncCloud ? await getValidGoogleContactsToken() : null;

  if (!token) {
    return { contact: localContact, cloudSynced: false };
  }

  const personPayload: Record<string, unknown> = {
    names: [{ givenName: localContact.name }],
    ...(localContact.email
      ? { emailAddresses: [{ value: localContact.email }] }
      : {}),
    ...(localContact.phone
      ? { phoneNumbers: [{ value: localContact.phone }] }
      : {}),
    ...(localContact.company || localContact.role || localContact.department
      ? {
          organizations: [
            {
              name: localContact.company || "",
              title: localContact.role || "",
              department: localContact.department || "",
            },
          ],
        }
      : {}),
    ...(localContact.notes
      ? { biographies: [{ value: localContact.notes, contentType: "TEXT_PLAIN" }] }
      : {}),
  };

  try {
    // Case A: Update existing Google Contact (`PATCH /v1/{resourceName}:updateContact`)
    if (
      localContact.resourceName &&
      localContact.resourceName.startsWith("people/")
    ) {
      let etag = localContact.etag;
      if (!etag) {
        const getRes = await fetch(
          `${PEOPLE_API_BASE}/${localContact.resourceName}?personFields=metadata`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (getRes.ok) {
          const metaPerson = (await getRes.json()) as { etag?: string };
          etag = metaPerson.etag;
        }
      }

      if (etag) {
        personPayload.etag = etag;
        const updateUrl = new URL(
          `${PEOPLE_API_BASE}/${localContact.resourceName}:updateContact`
        );
        updateUrl.searchParams.set(
          "updatePersonFields",
          "names,emailAddresses,phoneNumbers,organizations,biographies"
        );

        const patchRes = await fetch(updateUrl.toString(), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(personPayload),
        });

        if (patchRes.ok) {
          const updatedRemote = (await patchRes.json()) as GooglePersonResource;
          const updatedLocal = upsertContact({
            ...localContact,
            resourceName: updatedRemote.resourceName || localContact.resourceName,
            etag: updatedRemote.etag || etag,
            source: "google_people_api",
          });
          return { contact: updatedLocal, cloudSynced: true };
        }
      }
    }

    // Case B: Create new contact in Google Contacts Cloud (`POST /v1/people:createContact`)
    const createUrl = new URL(`${PEOPLE_API_BASE}/people:createContact`);
    createUrl.searchParams.set(
      "personFields",
      "names,emailAddresses,phoneNumbers,organizations,biographies,metadata"
    );

    const createRes = await fetch(createUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(personPayload),
    });

    if (createRes.ok) {
      const createdRemote = (await createRes.json()) as GooglePersonResource;
      const updatedLocal = upsertContact({
        ...localContact,
        id: localContact.id,
        resourceName: createdRemote.resourceName,
        etag: createdRemote.etag,
        source: "google_people_api",
      });
      return { contact: updatedLocal, cloudSynced: true };
    } else {
      const errText = await createRes.text();
      return {
        contact: localContact,
        cloudSynced: false,
        cloudError: `People API 반영 실패 (${createRes.status}): ${errText.slice(0, 120)}`,
      };
    }
  } catch (err) {
    return {
      contact: localContact,
      cloudSynced: false,
      cloudError: err instanceof Error ? err.message : "People API 통신 오류",
    };
  }
}

export function upsertContact(input: {
  id?: string;
  resourceName?: string;
  etag?: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  department?: string;
  notes?: string;
  photoUrl?: string;
  groups?: string[];
  starred?: boolean;
  source?: ContactItem["source"];
}): ContactItem {
  const db = getDb();
  const contacts = db.contacts || [];
  const cleanEmail = (input.email || "").trim().toLowerCase();
  const cleanName = input.name.trim() || (cleanEmail ? cleanEmail.split("@")[0] : "이름 없음");

  const existingIdx = contacts.findIndex(
    (c) =>
      (input.id && c.id === input.id) ||
      (input.resourceName && c.resourceName === input.resourceName) ||
      (cleanEmail && c.email.toLowerCase() === cleanEmail)
  );

  if (existingIdx >= 0) {
    const existing = contacts[existingIdx];
    const updated: ContactItem = {
      ...existing,
      resourceName: input.resourceName || existing.resourceName,
      etag: input.etag || existing.etag,
      name: cleanName || existing.name,
      email: input.email !== undefined ? input.email.trim() : existing.email,
      phone: input.phone !== undefined ? input.phone.trim() : existing.phone,
      company: input.company !== undefined ? input.company.trim() : existing.company,
      role: input.role !== undefined ? input.role.trim() : existing.role,
      department:
        input.department !== undefined ? input.department.trim() : existing.department,
      notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
      photoUrl: input.photoUrl || existing.photoUrl,
      groups: input.groups !== undefined ? input.groups : existing.groups,
      starred: input.starred !== undefined ? input.starred : existing.starred,
      source: input.source || existing.source,
      updatedAt: new Date().toISOString(),
    };
    contacts[existingIdx] = updated;
    db.contacts = contacts;
    saveDb(db);
    return updated;
  }

  const created: ContactItem = {
    id: generateId(),
    resourceName: input.resourceName,
    etag: input.etag,
    name: cleanName,
    email: (input.email || "").trim(),
    phone: input.phone?.trim(),
    company: input.company?.trim(),
    role: input.role?.trim(),
    department: input.department?.trim(),
    notes: input.notes?.trim(),
    photoUrl: input.photoUrl,
    groups: input.groups,
    starred: input.starred,
    source: input.source || "manual",
    updatedAt: new Date().toISOString(),
  };

  contacts.unshift(created);
  db.contacts = contacts;
  saveDb(db);
  return created;
}

/**
 * Deletes a contact locally AND from Google Contacts Cloud (`DELETE /v1/{resourceName}:deleteContact`) if connected!
 */
export async function deleteContactWithCloudSync(idOrQuery: string): Promise<{
  success: boolean;
  deleted?: ContactItem;
  cloudDeleted?: boolean;
  error?: string;
}> {
  const localRes = deleteContactById(idOrQuery);
  if (!localRes.success || !localRes.deleted) {
    return localRes;
  }

  const resName = localRes.deleted.resourceName;
  const token = await getValidGoogleContactsToken();
  let cloudDeleted = false;

  if (token && resName && resName.startsWith("people/")) {
    try {
      const delRes = await fetch(`${PEOPLE_API_BASE}/${resName}:deleteContact`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (delRes.ok) {
        cloudDeleted = true;
      }
    } catch {
      // ignore remote delete error
    }
  }

  return {
    success: true,
    deleted: localRes.deleted,
    cloudDeleted,
  };
}

export function deleteContactById(idOrQuery: string): {
  success: boolean;
  deleted?: ContactItem;
  error?: string;
} {
  const db = getDb();
  const contacts = db.contacts || [];
  const q = idOrQuery.trim().toLowerCase();

  const idx = contacts.findIndex(
    (c) =>
      c.id === idOrQuery ||
      c.resourceName === idOrQuery ||
      c.email.toLowerCase() === q ||
      c.name.toLowerCase() === q
  );

  if (idx === -1) {
    return { success: false, error: `일치하는 연락처를 찾을 수 없습니다: ${idOrQuery}` };
  }

  const [deleted] = contacts.splice(idx, 1);
  db.contacts = contacts;
  saveDb(db);
  return { success: true, deleted };
}

/**
 * Toggles the starred (favorite) state of a contact.
 */
export function toggleContactStar(idOrQuery: string): ContactItem | null {
  const db = getDb();
  const contacts = db.contacts || [];
  const q = idOrQuery.trim().toLowerCase();

  const target = contacts.find(
    (c) =>
      c.id === idOrQuery ||
      c.email.toLowerCase() === q ||
      c.name.toLowerCase() === q
  );
  if (!target) return null;

  target.starred = !target.starred;
  target.updatedAt = new Date().toISOString();
  saveDb(db);
  return target;
}

/**
 * Lists and creates Google Contact Groups/Labels (`contactGroups`).
 */
export function listContactGroups(): ContactGroupItem[] {
  const db = getDb();
  return db.contactGroups || [];
}

export async function createContactGroup(name: string): Promise<{
  success: boolean;
  group?: ContactGroupItem;
  error?: string;
}> {
  const cleanName = name.trim();
  if (!cleanName) {
    return { success: false, error: "생성할 그룹(라벨) 이름을 입력해 주세요." };
  }

  const db = getDb();
  if (!db.contactGroups) db.contactGroups = [];

  const token = await getValidGoogleContactsToken();
  if (token) {
    try {
      const res = await fetch(`${PEOPLE_API_BASE}/contactGroups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contactGroup: { name: cleanName },
        }),
      });

      if (res.ok) {
        const created = (await res.json()) as {
          resourceName: string;
          name?: string;
          formattedName?: string;
          groupType?: string;
        };
        const groupItem: ContactGroupItem = {
          id: created.resourceName,
          resourceName: created.resourceName,
          name: created.formattedName || created.name || cleanName,
          memberCount: 0,
          groupType: created.groupType || "USER_CONTACT_GROUP",
        };
        db.contactGroups.push(groupItem);
        saveDb(db);
        return { success: true, group: groupItem };
      }
    } catch {
      // fallback to local group creation below
    }
  }

  const localGroup: ContactGroupItem = {
    id: `contactGroups/local-${Date.now()}`,
    resourceName: `contactGroups/local-${Date.now()}`,
    name: cleanName,
    memberCount: 0,
    groupType: "USER_CONTACT_GROUP",
  };
  db.contactGroups.push(localGroup);
  saveDb(db);

  return { success: true, group: localGroup };
}

/**
 * Sync contacts automatically from connected Gmail account (INBOX + Sent Mail)
 */
export async function syncContactsFromGmail(maxMessages = 60): Promise<{
  success: boolean;
  addedCount: number;
  totalContacts: number;
  error?: string;
}> {
  const { email, appPassword } = getGmailCredentials();
  if (!email || !appPassword) {
    return {
      success: false,
      addedCount: 0,
      totalContacts: 0,
      error: "Gmail이 아직 연결되어 있지 않습니다. 먼저 Gmail 탭에서 16자리 앱 비밀번호로 연결해 주세요.",
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
    const discovered = new Map<string, string>(); // email -> name

    const mailboxesToScan = ["INBOX"];
    const allBoxes = await client.list();
    const sentBox = allBoxes.find(
      (b) =>
        b.specialUse === "\\Sent" ||
        b.path.toLowerCase().includes("sent") ||
        b.path.includes("보낸")
    );
    if (sentBox && !mailboxesToScan.includes(sentBox.path)) {
      mailboxesToScan.push(sentBox.path);
    }

    for (const boxPath of mailboxesToScan) {
      let lock;
      try {
        lock = await client.getMailboxLock(boxPath);
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (total > 0) {
          const count = Math.min(maxMessages, total);
          const startSeq = Math.max(1, total - count + 1);

          for await (const msg of client.fetch(`${startSeq}:${total}`, { envelope: true })) {
            const env = msg.envelope;
            if (!env) continue;

            const participants = [
              ...(env.from || []),
              ...(env.to || []),
              ...(env.cc || []),
            ];

            for (const p of participants) {
              const addr = p.address?.trim();
              if (!addr || isIgnoredEmail(addr, email)) continue;
              const key = addr.toLowerCase();
              const cleanName = (p.name || "").replace(/["']/g, "").trim();

              if (!discovered.has(key) || (!discovered.get(key) && cleanName)) {
                discovered.set(key, cleanName || addr.split("@")[0]);
              }
            }
          }
        }
      } catch (boxErr) {
        console.warn(`Mailbox scan warning (${boxPath}):`, boxErr);
      } finally {
        if (lock) lock.release();
      }
    }

    await client.logout();

    const db = getDb();
    const contacts = db.contacts || [];
    let addedCount = 0;

    for (const [addrLower, name] of Array.from(discovered.entries())) {
      const existing = contacts.find((c) => c.email.toLowerCase() === addrLower);
      if (!existing) {
        contacts.push({
          id: generateId(),
          name: name || addrLower.split("@")[0],
          email: addrLower,
          source: "gmail_sync",
          updatedAt: new Date().toISOString(),
        });
        addedCount++;
      } else if (existing.name === existing.email.split("@")[0] && name) {
        existing.name = name;
        existing.updatedAt = new Date().toISOString();
      }
    }

    db.contacts = contacts;
    saveDb(db);

    return {
      success: true,
      addedCount,
      totalContacts: contacts.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("syncContactsFromGmail error:", err);
    return {
      success: false,
      addedCount: 0,
      totalContacts: 0,
      error: message,
    };
  }
}

/**
 * Parse Google Contacts CSV or vCard (.vcf) file content and merge into DB
 */
export function importGoogleContactsFile(
  content: string,
  fileName: string
): {
  success: boolean;
  importedCount: number;
  totalContacts: number;
  error?: string;
} {
  try {
    const isVcf =
      fileName.toLowerCase().endsWith(".vcf") ||
      content.includes("BEGIN:VCARD");

    const parsedItems: Array<{
      name: string;
      email: string;
      phone?: string;
      company?: string;
      role?: string;
      notes?: string;
    }> = isVcf ? parseVCard(content) : parseGoogleCsv(content);

    const db = getDb();
    const contacts = db.contacts || [];
    let importedCount = 0;

    for (const item of parsedItems) {
      if (!item.email && !item.name) continue;
      const emailKey = (item.email || "").trim().toLowerCase();

      const existingIdx = emailKey
        ? contacts.findIndex((c) => c.email.toLowerCase() === emailKey)
        : contacts.findIndex((c) => c.name === item.name && c.phone === item.phone);

      if (existingIdx >= 0) {
        const ex = contacts[existingIdx];
        contacts[existingIdx] = {
          ...ex,
          name: item.name || ex.name,
          email: item.email || ex.email,
          phone: item.phone || ex.phone,
          company: item.company || ex.company,
          role: item.role || ex.role,
          notes: item.notes || ex.notes,
          updatedAt: new Date().toISOString(),
        };
      } else {
        contacts.unshift({
          id: generateId(),
          name: item.name || (item.email ? item.email.split("@")[0] : "이름 없음"),
          email: item.email || "",
          phone: item.phone,
          company: item.company,
          role: item.role,
          notes: item.notes,
          source: "google_csv",
          updatedAt: new Date().toISOString(),
        });
        importedCount++;
      }
    }

    db.contacts = contacts;
    saveDb(db);

    return {
      success: true,
      importedCount,
      totalContacts: contacts.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      importedCount: 0,
      totalContacts: 0,
      error: `파일 파싱 오류: ${message}`,
    };
  }
}

function parseVCard(vcfContent: string) {
  const results: Array<{
    name: string;
    email: string;
    phone?: string;
    company?: string;
    role?: string;
    notes?: string;
  }> = [];

  const cards = vcfContent.split(/BEGIN:VCARD/i);
  for (const card of cards) {
    if (!card.includes("END:VCARD")) continue;

    const lines = card.split(/\r?\n/);
    let name = "";
    let email = "";
    let phone = "";
    let company = "";
    let role = "";
    let notes = "";

    for (const line of lines) {
      const [rawKey, ...rest] = line.split(":");
      if (!rawKey || rest.length === 0) continue;
      const val = rest.join(":").trim();
      const keyUpper = rawKey.toUpperCase();

      if (keyUpper.startsWith("FN")) {
        name = val;
      } else if (keyUpper.startsWith("EMAIL") && !email) {
        email = val;
      } else if (keyUpper.startsWith("TEL") && !phone) {
        phone = val;
      } else if (keyUpper.startsWith("ORG")) {
        company = val.replace(/;/g, " ").trim();
      } else if (keyUpper.startsWith("TITLE")) {
        role = val;
      } else if (keyUpper.startsWith("NOTE")) {
        notes = val;
      }
    }

    if (name || email) {
      results.push({ name, email, phone, company, role, notes });
    }
  }

  return results;
}

function parseGoogleCsv(csvContent: string) {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  const findCol = (keywords: string[]) =>
    headers.findIndex((h) => keywords.some((k) => h === k || h.includes(k)));

  const nameIdx = findCol(["name", "full name", "이름"]);
  const firstNameIdx = findCol(["first name", "given name", "성"]);
  const lastNameIdx = findCol(["last name", "family name"]);
  const emailIdx = findCol(["e-mail 1 - value", "email", "e-mail", "이메일"]);
  const phoneIdx = findCol(["phone 1 - value", "phone", "mobile", "전화", "휴대폰"]);
  const orgIdx = findCol(["organization name", "organization 1 - name", "company", "회사", "소속"]);
  const titleIdx = findCol(["organization title", "organization 1 - title", "job title", "직급", "직함"]);
  const notesIdx = findCol(["notes", "메모"]);

  const results: Array<{
    name: string;
    email: string;
    phone?: string;
    company?: string;
    role?: string;
    notes?: string;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    let name = nameIdx >= 0 ? cols[nameIdx] || "" : "";
    if (!name && (firstNameIdx >= 0 || lastNameIdx >= 0)) {
      const f = firstNameIdx >= 0 ? cols[firstNameIdx] || "" : "";
      const l = lastNameIdx >= 0 ? cols[lastNameIdx] || "" : "";
      name = `${l} ${f}`.trim();
    }

    const email = emailIdx >= 0 ? (cols[emailIdx] || "").split(":::")[0].trim() : "";
    const phone = phoneIdx >= 0 ? (cols[phoneIdx] || "").split(":::")[0].trim() : undefined;
    const company = orgIdx >= 0 ? cols[orgIdx]?.trim() : undefined;
    const role = titleIdx >= 0 ? cols[titleIdx]?.trim() : undefined;
    const notes = notesIdx >= 0 ? cols[notesIdx]?.trim() : undefined;

    if (name || email) {
      results.push({ name, email, phone, company, role, notes });
    }
  }

  return results;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
