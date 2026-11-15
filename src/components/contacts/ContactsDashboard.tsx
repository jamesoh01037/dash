"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Upload,
  Plus,
  Trash2,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  CalendarPlus,
  Star,
  KeyRound,
  Cloud,
  Edit3,
  Tag,
  MessageCircle,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { ContactItem, ContactGroupItem } from "@/lib/db";

interface ContactsAuthStatus {
  authMode: "oauth2" | "token" | "gmail_imap";
  hasPeopleToken: boolean;
  hasOAuthClient: boolean;
  hasRefreshToken: boolean;
  connectedEmail?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
  gmailConnected: boolean;
  redirectUri?: string;
}

interface ContactsDashboardProps {
  onRefreshTrigger?: () => void;
  onTriggerChatPrompt?: (prompt: string) => void;
}

export default function ContactsDashboard({
  onRefreshTrigger,
  onTriggerChatPrompt,
}: ContactsDashboardProps) {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [groups, setGroups] = useState<ContactGroupItem[]>([]);
  const [authStatus, setAuthStatus] = useState<ContactsAuthStatus>({
    authMode: "gmail_imap",
    hasPeopleToken: false,
    hasOAuthClient: false,
    hasRefreshToken: false,
    gmailConnected: false,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [starredOnly, setStarredOnly] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [syncingPeople, setSyncingPeople] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modals
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"oauth2" | "token">("oauth2");
  const [showGroupModal, setShowGroupModal] = useState(false);

  // Contact Add / Edit Form
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formGroups, setFormGroups] = useState("");
  const [formStarred, setFormStarred] = useState(false);

  // Auth Form
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");

  // New Group Form
  const [newGroupName, setNewGroupName] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchContacts();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("contacts_auth") === "success") {
        setStatusMessage({
          type: "success",
          text: "Google 계정 OAuth 2.0 (People API v1) 전체 연동 및 클라우드 주소록 동기화가 완료되었습니다!",
        });
      } else if (params.get("contacts_error")) {
        setStatusMessage({
          type: "error",
          text: `Google 주소록 OAuth 인증 오류: ${params.get("contacts_error")}`,
        });
      }
    }
  }, []);

  const fetchContacts = async (remoteSearch = false) => {
    if (remoteSearch) setSearchingRemote(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (remoteSearch) params.set("remote", "true");

      const res = await fetch(`/api/contacts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setGroups(data.groups || []);
        if (data.authStatus) setAuthStatus(data.authStatus);

        if (remoteSearch) {
          setStatusMessage({
            type: "success",
            text: `People API & 조직 디렉터리 실시간 검색 완료 (신규 발견: ${
              data.remoteDiscoveredCount || 0
            }명)`,
          });
        }
      }
    } catch {
      console.error("Failed to fetch contacts");
    } finally {
      setLoading(false);
      setSearchingRemote(false);
    }
  };

  const handleSyncPeopleApi = async () => {
    setSyncingPeople(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_people_api" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "People API 동기화에 실패했습니다.",
        });
      } else {
        setContacts(data.contacts || []);
        setGroups(data.groups || []);
        if (data.authStatus) setAuthStatus(data.authStatus);
        setStatusMessage({
          type: "success",
          text: data.message,
        });
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Google People API 동기화 중 네트워크 오류가 발생했습니다.",
      });
    } finally {
      setSyncingPeople(false);
    }
  };

  const handleSyncGmail = async () => {
    setSyncingGmail(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_gmail", maxMessages: 80 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Gmail 연락처 동기화에 실패했습니다.",
        });
      } else {
        setContacts(data.contacts || []);
        setStatusMessage({
          type: "success",
          text: data.message || "Gmail에서 연락처를 성공적으로 가져왔습니다!",
        });
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Gmail 연락처 동기화 중 오류가 발생했습니다.",
      });
    } finally {
      setSyncingGmail(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMessage(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_file",
          fileName: file.name,
          content: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "주소록 파일 가져오기에 실패했습니다.",
        });
      } else {
        setContacts(data.contacts || []);
        setStatusMessage({
          type: "success",
          text: data.message || "Google 주소록 파일을 성공적으로 가져왔습니다!",
        });
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "파일을 읽는 중 오류가 발생했습니다.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openAddContactModal = () => {
    setEditingContact(null);
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormCompany("");
    setFormRole("");
    setFormDepartment("");
    setFormNotes("");
    setFormGroups("");
    setFormStarred(false);
    setShowContactModal(true);
  };

  const openEditContactModal = (c: ContactItem) => {
    setEditingContact(c);
    setFormName(c.name || "");
    setFormEmail(c.email || "");
    setFormPhone(c.phone || "");
    setFormCompany(c.company || "");
    setFormRole(c.role || "");
    setFormDepartment(c.department || "");
    setFormNotes(c.notes || "");
    setFormGroups((c.groups || []).filter((g) => g !== "starred").join(", "));
    setFormStarred(Boolean(c.starred));
    setShowContactModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() && !formEmail.trim()) return;

    setStatusMessage(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingContact ? "update" : "create",
          id: editingContact?.id,
          resourceName: editingContact?.resourceName,
          name: formName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || undefined,
          company: formCompany.trim() || undefined,
          role: formRole.trim() || undefined,
          department: formDepartment.trim() || undefined,
          notes: formNotes.trim() || undefined,
          groups: formGroups.trim() || undefined,
          starred: formStarred,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowContactModal(false);
        setStatusMessage({
          type: "success",
          text: data.message,
        });
        await fetchContacts();
        onRefreshTrigger?.();
      } else {
        setStatusMessage({
          type: "error",
          text: data.error || "연락처 저장에 실패했습니다.",
        });
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "연락처 저장 중 오류가 발생했습니다.",
      });
    }
  };

  const handleToggleStar = async (c: ContactItem) => {
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_star",
          id: c.id,
        }),
      });
      if (res.ok) {
        setContacts((prev) =>
          prev.map((item) =>
            item.id === c.id ? { ...item, starred: !item.starred } : item
          )
        );
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteContact = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/contacts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
        setStatusMessage({
          type: "success",
          text: `'${name}' 연락처가 삭제되었습니다.${
            data.cloudDeleted ? " (Google People API 클라우드에서도 삭제 완료)" : ""
          }`,
        });
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "연락처 삭제에 실패했습니다.",
      });
    }
  };

  const handleStartOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_oauth_config",
          clientId: clientIdInput.trim() || undefined,
          clientSecret: clientSecretInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ type: "error", text: data.error || "OAuth 설정 실패" });
      } else if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setStatusMessage({ type: "error", text: "OAuth 요청 중 오류가 발생했습니다." });
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_token",
          accessToken: accessTokenInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setContacts(data.contacts || []);
        setGroups(data.groups || []);
        if (data.authStatus) setAuthStatus(data.authStatus);
        setShowAuthModal(false);
        setAccessTokenInput("");
        setStatusMessage({ type: "success", text: data.message });
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "토큰 저장 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "토큰 저장 중 오류 발생" });
    }
  };

  const handleDisconnectAuth = async () => {
    try {
      const res = await fetch("/api/auth/google-contacts", { method: "DELETE" });
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "Google People API 인증 토큰 연결이 해제되었습니다.",
        });
        await fetchContacts();
      }
    } catch {
      setStatusMessage({ type: "error", text: "연결 해제 실패" });
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_group",
          name: newGroupName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGroups(data.groups || []);
        setNewGroupName("");
        setShowGroupModal(false);
        setStatusMessage({ type: "success", text: data.message });
      } else {
        setStatusMessage({ type: "error", text: data.error || "그룹 생성 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "그룹 생성 중 오류 발생" });
    }
  };

  const filteredContacts = contacts.filter((c) => {
    if (starredOnly && !c.starred && !c.groups?.includes("starred")) {
      return false;
    }
    if (selectedSource !== "all" && c.source !== selectedSource) {
      return false;
    }
    if (
      selectedGroup !== "all" &&
      !c.groups?.some((g) => g.toLowerCase() === selectedGroup.toLowerCase())
    ) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.role && c.role.toLowerCase().includes(q)) ||
      (c.department && c.department.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  });

  const cloudSyncedCount = contacts.filter(
    (c) => c.source === "google_people_api" || c.resourceName?.startsWith("people/")
  ).length;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950">
      {/* Top Banner & Sync Actions */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/30 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Users className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-100">
                Google 주소록 전체 연동 허브 (OAuth 2.0 & People API v1 확장)
              </h3>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700 font-medium">
                총 {contacts.length}명
              </span>
              {cloudSyncedCount > 0 && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 font-medium">
                  <Cloud className="w-3 h-3" /> People API 클라우드 {cloudSyncedCount}명
                </span>
              )}
              {authStatus.hasPeopleToken ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  People API 양방향 연동됨{" "}
                  {authStatus.connectedEmail ? `(${authStatus.connectedEmail})` : ""}
                </span>
              ) : authStatus.gmailConnected ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Gmail IMAP 자동 추출 활성
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              **Google People API v1 (OAuth 2.0 양방향 생성·수정·삭제·라벨·조직 디렉터리)**, **Gmail 수발신 연락처 자동 추출**, **CSV/vCard 파일 가져오기**를 모두 지원합니다.
              채팅창에서 *"홍길동 팀장님께 메일 써줘"* 또는 *"김철수 대리 전화번호 수정해 줘"*라고 말하면 Google 주소록 클라우드와 실시간으로 연동됩니다.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 flex items-center gap-1.5 transition-all"
            >
              <KeyRound className="w-3.5 h-3.5" />
              OAuth 2.0 / People API 설정
            </button>

            <button
              onClick={handleSyncPeopleApi}
              disabled={syncingPeople}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {syncingPeople ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              People API 클라우드 동기화
            </button>

            <button
              onClick={handleSyncGmail}
              disabled={syncingGmail}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {syncingGmail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
              )}
              Gmail 연락처 추출
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.vcf,text/csv,text/vcard"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              CSV/vCard 업로드
            </button>

            <button
              onClick={openAddContactModal}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              연락처 추가
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              statusMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-[11px] opacity-70 hover:opacity-100"
            >
              닫기
            </button>
          </div>
        )}
      </div>

      {/* Search Bar & Source / Group Filters */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름, 이메일, 전화번호, 회사, 직책, 부서로 검색..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            {authStatus.hasPeopleToken && (
              <button
                onClick={() => fetchContacts(true)}
                disabled={searchingRemote || !searchQuery.trim()}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-40 text-cyan-300 border border-cyan-500/30 text-xs font-medium flex items-center gap-1.5 shrink-0"
                title="Google People API 및 Workspace 조직 디렉터리 실시간 검색"
              >
                {searchingRemote ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                디렉터리 원격 검색
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <button
              onClick={() => setShowGroupModal(true)}
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              <Tag className="w-3 h-3" /> + 새 라벨/그룹 만들기
            </button>
            <a
              href="https://contacts.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-cyan-400 flex items-center gap-1"
            >
              Google 주소록 열기 <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            onClick={() => {
              setSelectedSource("all");
              setSelectedGroup("all");
              setStarredOnly(false);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              selectedSource === "all" && selectedGroup === "all" && !starredOnly
                ? "bg-cyan-600 text-white"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            전체 ({contacts.length})
          </button>

          <button
            onClick={() => setStarredOnly(!starredOnly)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
              starredOnly
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Star className="w-3 h-3" /> 즐겨찾기
          </button>

          {[
            { id: "google_people_api", label: "☁️ People API 클라우드" },
            { id: "google_directory", label: "🏢 조직 디렉터리" },
            { id: "google_other", label: "📨 기타 연락처" },
            { id: "gmail_sync", label: "✉️ Gmail 추출" },
            { id: "google_csv", label: "📂 CSV/vCard" },
          ].map((src) => (
            <button
              key={src.id}
              onClick={() =>
                setSelectedSource(selectedSource === src.id ? "all" : src.id)
              }
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                selectedSource === src.id
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {src.label}
            </button>
          ))}

          {groups
            .filter((g) => g.groupType === "USER_CONTACT_GROUP")
            .map((g) => (
              <button
                key={g.id}
                onClick={() =>
                  setSelectedGroup(selectedGroup === g.name ? "all" : g.name)
                }
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
                  selectedGroup === g.name
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                    : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <Tag className="w-2.5 h-2.5" /> {g.name}
              </button>
            ))}
        </div>
      </div>

      {/* Contacts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          <span>주소록을 불러오는 중입니다...</span>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">
            {searchQuery
              ? "조건에 일치하는 연락처가 없습니다."
              : "아직 동기화된 연락처가 없습니다."}
          </p>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            상단의 <strong>[OAuth 2.0 / People API 설정]</strong>으로 Google 주소록 전체를 양방향 연동하거나,{" "}
            <strong>[Gmail 연락처 추출]</strong> 버튼으로 최근 메일 교류 상대를 1초 만에 가져오세요!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredContacts.map((c) => (
            <div
              key={c.id}
              className="group bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between gap-3 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {c.photoUrl ? (
                    <img
                      src={c.photoUrl}
                      alt={c.name}
                      className="w-10 h-10 rounded-full object-cover border border-cyan-500/30 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600/30 to-blue-500/30 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-sm shrink-0">
                      {c.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h5 className="text-sm font-bold text-slate-100 truncate">
                        {c.name}
                      </h5>
                      <button
                        onClick={() => handleToggleStar(c)}
                        className={`p-0.5 transition-colors ${
                          c.starred
                            ? "text-amber-400"
                            : "text-slate-600 hover:text-amber-400"
                        }`}
                        title="즐겨찾기 토글"
                      >
                        <Star
                          className="w-3.5 h-3.5"
                          fill={c.starred ? "currentColor" : "none"}
                        />
                      </button>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                        {c.source === "google_people_api"
                          ? "☁️ People API"
                          : c.source === "google_directory"
                          ? "🏢 디렉터리"
                          : c.source === "google_other"
                          ? "📨 기타"
                          : c.source === "gmail_sync"
                          ? "✉️ Gmail"
                          : c.source === "google_csv"
                          ? "📂 CSV"
                          : "직접 등록"}
                      </span>
                    </div>
                    {c.email && (
                      <p className="text-xs text-cyan-400/90 truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditContactModal(c)}
                    className="p-1.5 text-slate-400 hover:text-cyan-300 rounded-lg"
                    title="연락처 수정 (People API 양방향 반영)"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(c.id, c.name)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg"
                    title="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Extra Metadata */}
              <div className="space-y-1 text-[11px] text-slate-400">
                {(c.company || c.role || c.department) && (
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">
                      {[c.company, c.department, c.role].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2 truncate">
                    <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{c.phone}</span>
                  </div>
                )}
                {c.groups && c.groups.filter((g) => g !== "starred").length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {c.groups
                      .filter((g) => g !== "starred")
                      .map((g, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20"
                        >
                          #{g}
                        </span>
                      ))}
                  </div>
                )}
                {c.notes && (
                  <p className="text-slate-500 line-clamp-1 italic">“{c.notes}”</p>
                )}
              </div>

              {/* Quick AI Actions */}
              <div className="pt-2 border-t border-slate-800/70 flex items-center gap-1.5">
                {c.email && (
                  <button
                    onClick={() =>
                      onTriggerChatPrompt?.(
                        `${c.name}님(${c.email})에게 보낼 안부 및 업무 협의 이메일 초안을 작성해 줘.`
                      )
                    }
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/60 hover:border-cyan-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    메일 초안
                  </button>
                )}
                <button
                  onClick={() =>
                    onTriggerChatPrompt?.(
                      `Google Chat 스페이스에 ${c.name}님(${
                        c.email || c.phone || "연락처"
                      }) 관련 협업 알림 카드를 전송해 줘.`
                    )
                  }
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700/60 hover:border-amber-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                >
                  <MessageCircle className="w-3 h-3 text-amber-400" />
                  Chat 공유
                </button>
                <button
                  onClick={() =>
                    onTriggerChatPrompt?.(
                      `${c.name}님${c.email ? `(${c.email})` : ""}과의 미팅 일정을 내일 오후 2시로 할 일(To-Do)에 등록해 줘.`
                    )
                  }
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 border border-slate-700/60 hover:border-emerald-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                >
                  <CalendarPlus className="w-3 h-3 text-emerald-400" />
                  일정 잡기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Add / Edit Contact Modal (Two-Way People API Cloud Sync) */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                {editingContact ? (
                  <>
                    <Edit3 className="w-4 h-4 text-cyan-400" />
                    연락처 수정 {editingContact.resourceName ? "(People API 양방향 동기화)" : ""}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-cyan-400" />
                    새 연락처 등록 {authStatus.hasPeopleToken ? "(People API 클라우드 자동 생성)" : ""}
                  </>
                )}
              </h4>
              <button
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">이름 *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="예: 홍길동"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">이메일 주소 *</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="예: hong@company.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">전화번호</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">회사/소속</label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="예: Google Korea"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">직책 / 부서</label>
                  <input
                    type="text"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    placeholder="예: 팀장 / 개발본부"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">
                    라벨/그룹 (쉼표로 구분)
                  </label>
                  <input
                    type="text"
                    value={formGroups}
                    onChange={(e) => setFormGroups(e.target.value)}
                    placeholder="예: VIP, 개발팀"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formStarred}
                      onChange={(e) => setFormStarred(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-amber-500"
                    />
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    즐겨찾기(별표 연락처)로 지정
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">메모</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="담당 프로젝트나 참고 메모"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 text-white font-semibold hover:bg-cyan-500"
                >
                  {editingContact ? "수정 사항 저장" : "연락처 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: OAuth 2.0 / People API v1 Configuration */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                Google 주소록 전체 연동 설정 (OAuth 2.0 / People API v1)
              </h4>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAuthTab("oauth2")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "oauth2"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Google OAuth 2.0 전체 연동
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("token")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "token"
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. People API Bearer 토큰 입력
              </button>
            </div>

            {authTab === "oauth2" && (
              <form onSubmit={handleStartOAuth} className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 space-y-1 text-[11px]">
                  <p className="text-slate-200 font-semibold">
                    ☁️ Google People API v1 양방향 동기화 (Refresh Token 자동 갱신)
                  </p>
                  <p>
                    승인된 리디렉션 URI에{" "}
                    <code className="text-cyan-300">
                      {authStatus.redirectUri ||
                        "http://localhost:3000/api/auth/google-contacts/callback"}
                    </code>{" "}
                    를 추가하세요. (이미 Google Chat 탭에서 Client ID/Secret을 등록하셨다면 비워두고 바로 연동 버튼을 누르셔도 됩니다!)
                  </p>
                  <p className="text-slate-500">
                    요청 스코프: <code>contacts</code> (양방향 CRUD),{" "}
                    <code>contacts.other.readonly</code> (기타 연락처),{" "}
                    <code>directory.readonly</code> (조직 디렉터리)
                  </p>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Google OAuth Client ID {authStatus.hasOAuthClient ? "(기존 설정 저장됨)" : ""}
                  </label>
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Google OAuth Client Secret
                  </label>
                  <input
                    type="password"
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    placeholder="GOCSPX-..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  {authStatus.hasPeopleToken ? (
                    <button
                      type="button"
                      onClick={handleDisconnectAuth}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20"
                    >
                      People API 인증 해제
                    </button>
                  ) : (
                    <div />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-cyan-600 text-white font-semibold hover:bg-cyan-500"
                    >
                      Google 계정으로 주소록 전체 연동하기
                    </button>
                  </div>
                </div>
              </form>
            )}

            {authTab === "token" && (
              <form onSubmit={handleSaveToken} className="space-y-3 text-xs">
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  <code>https://www.googleapis.com/auth/contacts</code> 권한이 포함된 Bearer Access Token(<code>ya29...</code>)을 직접 입력하면 즉시 Google People API 클라우드 주소록과 동기화합니다.
                </p>
                <input
                  type="password"
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  placeholder="ya29.a0AfH6SM..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-cyan-600 text-white font-semibold hover:bg-cyan-500"
                  >
                    토큰 저장 및 클라우드 동기화
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal 3: Create New Contact Group / Label (`POST /v1/contactGroups`) */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-400" />
                새 Google 주소록 라벨/그룹 생성 (`contactGroups`)
              </h4>
              <button
                onClick={() => setShowGroupModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">라벨/그룹 이름 *</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="예: 핵심 파트너사, 프로젝트 TF"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500"
                >
                  그룹 생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
