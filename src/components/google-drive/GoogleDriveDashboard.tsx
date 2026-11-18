"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  HardDrive,
  Search,
  RefreshCw,
  Upload,
  Plus,
  FolderPlus,
  Trash2,
  FileText,
  Table,
  Presentation,
  Folder,
  File,
  Star,
  Share2,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  Cloud,
  ShieldCheck,
  MessageCircle,
  Mail,
  BookOpen,
  Copy,
  Globe,
} from "lucide-react";
import { GoogleDriveFileItem } from "@/lib/db";
import { withGoogleAuthUser } from "@/lib/utils";

interface DriveAuthStatus {
  authMode: "oauth2" | "service_account" | "token" | "local";
  hasDriveToken: boolean;
  hasOAuthClient: boolean;
  hasRefreshToken: boolean;
  hasServiceAccount: boolean;
  connectedEmail?: string;
  storageUsageBytes?: number;
  storageLimitBytes?: number;
  connectedAt?: string;
  lastSyncedAt?: string;
  redirectUri?: string;
}

interface GoogleDriveDashboardProps {
  onRefreshTrigger?: () => void;
  onTriggerChatPrompt?: (prompt: string) => void;
}

export default function GoogleDriveDashboard({
  onRefreshTrigger,
  onTriggerChatPrompt,
}: GoogleDriveDashboardProps) {
  const [files, setFiles] = useState<GoogleDriveFileItem[]>([]);
  const [authStatus, setAuthStatus] = useState<DriveAuthStatus>({
    authMode: "local",
    hasDriveToken: false,
    hasOAuthClient: false,
    hasRefreshToken: false,
    hasServiceAccount: false,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [mimeCategory, setMimeCategory] = useState<
    "all" | "doc" | "sheet" | "slide" | "hwp" | "folder" | "pdf_other"
  >("all");
  const [starredOnly, setStarredOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<"oauth2" | "service_account" | "token">("oauth2");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showReaderModal, setShowReaderModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Auth Form
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [serviceAccountInput, setServiceAccountInput] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");

  // Create Doc Form
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState<
    "google_doc" | "google_sheet" | "google_slide" | "hwpx" | "hwp" | "markdown" | "text"
  >("google_doc");
  const [docDesc, setDocDesc] = useState("");
  const [docContent, setDocContent] = useState("");

  // Create Folder Form
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");

  // Reader / Editor State (including Chrome rhwp extension mode for .hwp / .hwpx)
  const [activeFile, setActiveFile] = useState<GoogleDriveFileItem | null>(null);
  const [readerContent, setReaderContent] = useState("");
  const [loadingReader, setLoadingReader] = useState(false);
  const [savingReader, setSavingReader] = useState(false);
  const [hwpEditorTab, setHwpEditorTab] = useState<"rhwp_ split" | "text_edit" | "rhwp_frame">(
    "rhwp_ split"
  );
  const [customRhwpExtUrl, setCustomRhwpExtUrl] = useState("");

  // Share State
  const [shareTargetFile, setShareTargetFile] = useState<GoogleDriveFileItem | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"reader" | "commenter" | "writer">("reader");
  const [makePublicLink, setMakePublicLink] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchDriveHub(false);

    if (typeof window !== "undefined") {
      const savedExtUrl = window.localStorage.getItem("junior_rhwp_ext_url");
      if (savedExtUrl) setCustomRhwpExtUrl(savedExtUrl);

      const params = new URLSearchParams(window.location.search);
      if (params.get("gdrive_auth") === "success") {
        setStatusMessage({
          type: "success",
          text: "Google 계정 OAuth 2.0 (Google Drive API v3) 전체 연동 및 파일 동기화가 완료되었습니다!",
        });
      } else if (params.get("gdrive_error")) {
        setStatusMessage({
          type: "error",
          text: `Google Drive OAuth 인증 오류: ${params.get("gdrive_error")}`,
        });
      }
    }
  }, []);

  const isHwpOrHwpx = (f: GoogleDriveFileItem): boolean => {
    const n = (f.name || "").trim().toLowerCase();
    const m = (f.mimeType || "").trim().toLowerCase();
    return (
      n.endsWith(".hwp") ||
      n.endsWith(".hwpx") ||
      m.includes("hwp") ||
      m.includes("haansoft") ||
      m.includes("hancom")
    );
  };

  const getRhwpStreamUrl = (f: GoogleDriveFileItem, download = false): string => {
    const targetId = encodeURIComponent(f.driveFileId || f.id);
    const safeName = encodeURIComponent(
      /\.(hwp|hwpx)$/i.test(f.name) ? f.name : `${f.name}.hwp`
    );
    return `/api/google-drive/hwp/${targetId}/${safeName}${download ? "?download=1" : ""}`;
  };

  const handleLaunchRhwpExtension = (f: GoogleDriveFileItem) => {
    if (typeof window === "undefined") return;
    const streamPath = getRhwpStreamUrl(f, false);
    const fullStreamUrl = `${window.location.origin}${streamPath}`;

    if (customRhwpExtUrl.trim()) {
      const targetUrl = customRhwpExtUrl.includes("{url}")
        ? customRhwpExtUrl.replace("{url}", encodeURIComponent(fullStreamUrl))
        : `${customRhwpExtUrl.replace(/\/$/, "")}?file=${encodeURIComponent(fullStreamUrl)}`;
      window.open(targetUrl, "_blank", "noopener,noreferrer");
      return;
    }

    // Default: open direct .hwp / .hwpx stream URL in a new Chrome tab so the `rhwp` Chrome extension intercepts it automatically
    window.open(fullStreamUrl, "_blank", "noopener,noreferrer");
  };

  const fetchDriveHub = async (sync = false) => {
    if (sync) setSyncing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (sync) params.set("sync", "true");
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/google-drive?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        if (data.authStatus) setAuthStatus(data.authStatus);

        if (sync) {
          if (data.syncError) {
            setStatusMessage({ type: "error", text: data.syncError });
          } else {
            setStatusMessage({
              type: "success",
              text: `Google Drive 파일 목록 (${(data.files || []).length}개) 동기화가 완료되었습니다.`,
            });
          }
        }
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Google Drive 정보를 불러오는 중 오류가 발생했습니다.",
      });
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleStartOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-drive", {
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
      setStatusMessage({ type: "error", text: "OAuth 요청 중 오류 발생" });
    }
  };

  const handleSaveServiceAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_service_account",
          serviceAccountJson: serviceAccountInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
        if (data.authStatus) setAuthStatus(data.authStatus);
        setShowAuthModal(false);
        setServiceAccountInput("");
        setStatusMessage({ type: "success", text: data.message });
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "서비스 계정 저장 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "서비스 계정 저장 중 오류 발생" });
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_token",
          accessToken: accessTokenInput.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
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
      const res = await fetch("/api/auth/google-drive", { method: "DELETE" });
      if (res.ok) {
        setStatusMessage({
          type: "success",
          text: "Google Drive API 인증 토큰 연결이 해제되었습니다.",
        });
        await fetchDriveHub(false);
      }
    } catch {
      setStatusMessage({ type: "error", text: "연결 해제 실패" });
    }
  };

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) return;

    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_doc",
          name: docName.trim(),
          docType,
          description: docDesc.trim() || undefined,
          content: docContent || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
        setDocName("");
        setDocDesc("");
        setDocContent("");
        setShowCreateModal(false);
        setStatusMessage({ type: "success", text: data.message });
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "문서 생성 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "문서 생성 중 오류 발생" });
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    setStatusMessage(null);
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_folder",
          name: folderName.trim(),
          description: folderDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
        setFolderName("");
        setFolderDesc("");
        setShowFolderModal(false);
        setStatusMessage({ type: "success", text: data.message });
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "폴더 생성 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "폴더 생성 중 오류 발생" });
    }
  };

  const handleLocalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMessage(null);
    try {
      const lower = file.name.toLowerCase();
      const isHwpx = lower.endsWith(".hwpx");
      const isHwp = lower.endsWith(".hwp");
      const isCsv = lower.endsWith(".csv");
      const isMd = lower.endsWith(".md");
      const content = await file.text();

      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_doc",
          name: file.name,
          docType: isHwpx
            ? "hwpx"
            : isHwp
            ? "hwp"
            : isCsv
            ? "google_sheet"
            : isMd
            ? "markdown"
            : "google_doc",
          content,
          description:
            isHwp || isHwpx
              ? `한글 문서 업로드 (${file.name}) — 크롬 rhwp 확장프로그램 본문/편집 지원`
              : `로컬 파일 업로드 (${file.name})`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
        setStatusMessage({ type: "success", text: data.message });
        onRefreshTrigger?.();
      } else {
        setStatusMessage({ type: "error", text: data.error || "파일 업로드 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "파일 업로드 중 오류 발생" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenReader = async (f: GoogleDriveFileItem) => {
    setActiveFile(f);
    setReaderContent(f.contentPreview || "");
    setShowReaderModal(true);
    setLoadingReader(true);

    try {
      const res = await fetch(
        `/api/google-drive?readId=${encodeURIComponent(f.driveFileId || f.id)}`
      );
      const data = await res.json();
      if (res.ok && data.content !== undefined) {
        setReaderContent(data.content);
      }
    } catch {
      // fallback to preview
    } finally {
      setLoadingReader(false);
    }
  };

  const handleSaveReaderContent = async () => {
    if (!activeFile) return;
    setSavingReader(true);
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_file",
          fileIdOrName: activeFile.driveFileId || activeFile.id,
          content: readerContent,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files || []);
        setStatusMessage({ type: "success", text: data.message });
        setShowReaderModal(false);
      } else {
        setStatusMessage({ type: "error", text: data.error || "저장 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "본문 저장 중 오류 발생" });
    } finally {
      setSavingReader(false);
    }
  };

  const handleToggleStar = async (f: GoogleDriveFileItem) => {
    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_file",
          fileIdOrName: f.driveFileId || f.id,
          starred: !f.starred,
        }),
      });
      if (res.ok) {
        setFiles((prev) =>
          prev.map((item) =>
            item.id === f.id ? { ...item, starred: !item.starred } : item
          )
        );
      }
    } catch {
      // ignore
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTargetFile) return;

    try {
      const res = await fetch("/api/google-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "share_file",
          fileIdOrName: shareTargetFile.driveFileId || shareTargetFile.id,
          email: shareEmail.trim() || undefined,
          role: shareRole,
          makePublicLink,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ type: "success", text: data.message });
        setShowShareModal(false);
        setShareEmail("");
        await fetchDriveHub(false);
      } else {
        setStatusMessage({ type: "error", text: data.error || "공유 설정 실패" });
      }
    } catch {
      setStatusMessage({ type: "error", text: "공유 설정 중 오류 발생" });
    }
  };

  const handleDeleteFile = async (f: GoogleDriveFileItem) => {
    try {
      const res = await fetch(
        `/api/google-drive?id=${encodeURIComponent(f.driveFileId || f.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok) {
        setFiles((prev) => prev.filter((item) => item.id !== f.id));
        setStatusMessage({
          type: "success",
          text: `'${f.name}' 파일이 삭제되었습니다.${
            data.cloudDeleted ? " (Google Drive 휴지통 이동 완료)" : ""
          }`,
        });
        onRefreshTrigger?.();
      }
    } catch {
      setStatusMessage({ type: "error", text: "파일 삭제 실패" });
    }
  };

  const getFileIcon = (mime: string, name = "") => {
    const m = mime.toLowerCase();
    const n = name.toLowerCase();
    if (
      n.endsWith(".hwp") ||
      n.endsWith(".hwpx") ||
      m.includes("hwp") ||
      m.includes("haansoft") ||
      m.includes("hancom")
    ) {
      return (
        <span className="w-5 h-5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-300 font-extrabold text-[10px] flex items-center justify-center">
          한
        </span>
      );
    }
    if (m.includes("google-apps.folder")) {
      return <Folder className="w-5 h-5 text-amber-400" />;
    }
    if (m.includes("google-apps.document") || m.includes("text") || m.includes("markdown")) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    if (m.includes("google-apps.spreadsheet") || m.includes("csv") || m.includes("excel")) {
      return <Table className="w-5 h-5 text-emerald-400" />;
    }
    if (m.includes("google-apps.presentation")) {
      return <Presentation className="w-5 h-5 text-orange-400" />;
    }
    return <File className="w-5 h-5 text-indigo-400" />;
  };

  const getMimeLabel = (mime: string, name = "") => {
    const m = mime.toLowerCase();
    const n = name.toLowerCase();
    if (n.endsWith(".hwpx") || m.includes("hwpx")) return "한글 문서 (.hwpx)";
    if (n.endsWith(".hwp") || m.includes("hwp") || m.includes("haansoft")) return "한글 문서 (.hwp)";
    if (m.includes("google-apps.folder")) return "폴더";
    if (m.includes("google-apps.document")) return "Google 문서";
    if (m.includes("google-apps.spreadsheet")) return "Google 시트";
    if (m.includes("google-apps.presentation")) return "프레젠테이션";
    if (m.includes("markdown")) return "Markdown";
    if (m.includes("pdf")) return "PDF";
    return "파일";
  };

  const filteredFiles = files.filter((f) => {
    if (starredOnly && !f.starred) return false;
    if (mimeCategory !== "all") {
      const m = f.mimeType.toLowerCase();
      if (mimeCategory === "hwp" && !isHwpOrHwpx(f)) {
        return false;
      }
      if (
        mimeCategory === "doc" &&
        (isHwpOrHwpx(f) ||
          (!m.includes("google-apps.document") &&
            !m.includes("text/") &&
            !m.includes("markdown")))
      ) {
        return false;
      }
      if (
        mimeCategory === "sheet" &&
        !m.includes("google-apps.spreadsheet") &&
        !m.includes("csv")
      ) {
        return false;
      }
      if (mimeCategory === "slide" && !m.includes("google-apps.presentation")) {
        return false;
      }
      if (mimeCategory === "folder" && !m.includes("google-apps.folder")) {
        return false;
      }
      if (
        mimeCategory === "pdf_other" &&
        (m.includes("google-apps.document") ||
          m.includes("google-apps.spreadsheet") ||
          m.includes("google-apps.presentation") ||
          m.includes("google-apps.folder") ||
          isHwpOrHwpx(f))
      ) {
        return false;
      }
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.description && f.description.toLowerCase().includes(q)) ||
      (f.contentPreview && f.contentPreview.toLowerCase().includes(q))
    );
  });

  const usedGb = authStatus.storageUsageBytes
    ? (authStatus.storageUsageBytes / 1024 ** 3).toFixed(2)
    : null;
  const limitGb = authStatus.storageLimitBytes
    ? (authStatus.storageLimitBytes / 1024 ** 3).toFixed(0)
    : null;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/30 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <HardDrive className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-100">
                Google 드라이브 전체 연동 허브 (OAuth 2.0 & Drive API v3 확장)
              </h3>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700 font-medium">
                {files.length}개 항목
              </span>
              {authStatus.hasDriveToken ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Drive API 연동됨{" "}
                  {authStatus.connectedEmail ? `(${authStatus.connectedEmail})` : ""}
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  로컬 드라이브 워크스페이스 모드
                </span>
              )}
              {usedGb && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  저장공간: {usedGb}GB {limitGb ? `/ ${limitGb}GB` : "사용 중"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              **Google Drive API v3 (OAuth 2.0 / 서비스 계정 / 토큰)**로 Google 문서(Docs), 스프레드시트(Sheets), 폴더를 실시간 조회·본문 읽기·생성·공유하고,
              대화창에서 *"오늘 회의록을 구글 드라이브에 새 문서로 만들고 구글 챗에 공유해 줘"*라고 지시할 수 있습니다.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition-all"
            >
              <KeyRound className="w-3.5 h-3.5" />
              OAuth 2.0 / Drive API 설정
            </button>

            <button
              onClick={() => fetchDriveHub(true)}
              disabled={syncing}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              클라우드 동기화
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              새 문서/시트 생성
            </button>

            <button
              onClick={() => setShowFolderModal(true)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              새 폴더
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".hwp,.hwpx,.txt,.md,.csv,.json,text/*"
              onChange={handleLocalFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              파일 업로드 (.hwp/.hwpx 지원)
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

      {/* One-Click AI Drive Automation Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>Junior 원클릭 Google Drive 자동화:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                "현재 내 미완료 할 일(To-Do)과 프로젝트 현황을 정리해서 Google Drive에 '오늘의 업무 리포트'라는 새 Google 문서(google_doc)로 생성해 줘."
              )
            }
            className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            업무 리포트 Google 문서 생성
          </button>

          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                "내 Gmail에서 최근 중요한 메일들을 요약 정리해서 Google Drive에 '주간 이메일 브리핑'이라는 새 Google 문서로 저장해 줘."
              )
            }
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            메일 요약본 드라이브 저장
          </button>

          <button
            onClick={() =>
              onTriggerChatPrompt?.(
                "내 Google Drive에 있는 최근 문서 목록을 조회해서 핵심 내용을 브리핑해 줘."
              )
            }
            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            최근 드라이브 문서 브리핑
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="파일명(.hwp, .hwpx 포함), 문서 제목, 설명 또는 본문 키워드로 검색..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
            {authStatus.hasDriveToken && (
              <button
                onClick={() => fetchDriveHub(true)}
                disabled={syncing}
                className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-3.5 h-3.5" />
                Drive 원격 검색
              </button>
            )}
          </div>

          <a
            href={withGoogleAuthUser("https://drive.google.com", authStatus?.connectedEmail)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1 shrink-0"
          >
            Google Drive 열기 <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {[
            { id: "all", label: `전체 (${files.length})` },
            { id: "hwp", label: "🟦 한글 문서 (.hwp/.hwpx · rhwp)" },
            { id: "doc", label: "📄 Google 문서 / 텍스트" },
            { id: "sheet", label: "📊 스프레드시트 / CSV" },
            { id: "slide", label: "📽️ 프레젠테이션" },
            { id: "folder", label: "📁 폴더" },
            { id: "pdf_other", label: "📕 PDF / 일반 파일" },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setMimeCategory(
                  cat.id as "all" | "doc" | "sheet" | "slide" | "hwp" | "folder" | "pdf_other"
                )
              }
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                mimeCategory === cat.id
                  ? cat.id === "hwp"
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-500/30"
                    : "bg-indigo-600 text-white"
                  : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {cat.label}
            </button>
          ))}

          <button
            onClick={() => setStarredOnly(!starredOnly)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all ${
              starredOnly
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <Star className="w-3 h-3" /> 중요(별표)
          </button>
        </div>
      </div>

      {/* Files Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-xs gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span>Google Drive 파일 목록을 불러오는 중입니다...</span>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-10 text-center space-y-3">
          <HardDrive className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">
            {searchQuery
              ? "검색 조건에 일치하는 드라이브 파일이 없습니다."
              : "아직 표시할 드라이브 파일이나 문서가 없습니다."}
          </p>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            상단의 <strong>[OAuth 2.0 / Drive API 설정]</strong>으로 내 Google Drive를 연결하거나,{" "}
            <strong>[+ 새 문서/시트 생성]</strong> 버튼으로 Google 문서 및 한글 문서(.hwp/.hwpx)를 바로 만들어 보세요!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredFiles.map((f) => {
            const hwpDoc = isHwpOrHwpx(f);
            return (
              <div
                key={f.id}
                className={`group bg-slate-900/70 hover:bg-slate-900 border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all ${
                  hwpDoc
                    ? "border-sky-500/30 hover:border-sky-400/50"
                    : "border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                      {getFileIcon(f.mimeType, f.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h5 className="text-sm font-bold text-slate-100 truncate">
                          {f.name}
                        </h5>
                        <button
                          onClick={() => handleToggleStar(f)}
                          className={`p-0.5 transition-colors ${
                            f.starred
                              ? "text-amber-400"
                              : "text-slate-600 hover:text-amber-400"
                          }`}
                          title="중요(별표) 토글"
                        >
                          <Star
                            className="w-3.5 h-3.5"
                            fill={f.starred ? "currentColor" : "none"}
                          />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            hwpDoc
                              ? "bg-sky-500/15 text-sky-300 border-sky-500/30 font-semibold"
                              : "bg-slate-800 text-indigo-300 border-slate-700/60"
                          }`}
                        >
                          {getMimeLabel(f.mimeType, f.name)}
                        </span>
                        {hwpDoc && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                            🧩 rhwp 확장 연동
                          </span>
                        )}
                        {f.source === "google_drive_api" ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                            ☁️ Drive Cloud
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            로컬 문서
                          </span>
                        )}
                        {f.shared && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                            공유됨
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {hwpDoc && (
                      <button
                        onClick={() => handleLaunchRhwpExtension(f)}
                        className="px-2 py-1 text-[10px] font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-lg transition-all"
                        title="크롬 rhwp 확장프로그램으로 즉시 열기"
                      >
                        rhwp 열기
                      </button>
                    )}
                    {f.webViewLink && (
                      <a
                        href={f.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-slate-400 hover:text-indigo-400 rounded-lg"
                        title="Google Drive에서 열기"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setShareTargetFile(f);
                        setShowShareModal(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg"
                      title="공유 및 권한 설정"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteFile(f)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Description / Content Excerpt */}
                <div className="text-[11px] text-slate-400 space-y-1">
                  {f.description && (
                    <p className="text-slate-300 line-clamp-1">{f.description}</p>
                  )}
                  {f.contentPreview && (
                    <p className="text-slate-500 line-clamp-2 font-mono text-[10px] bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                      {f.contentPreview.slice(0, 140)}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>{f.ownerName || f.ownerEmail || "내 드라이브"}</span>
                    <span>
                      수정:{" "}
                      {new Date(f.modifiedTime).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Quick AI & Collaboration Actions */}
                <div className="pt-2 border-t border-slate-800/70 flex items-center gap-1.5">
                  {!f.mimeType.includes("folder") && (
                    <button
                      onClick={() => handleOpenReader(f)}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 transition-all ${
                        hwpDoc
                          ? "bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border-sky-500/30"
                          : "bg-slate-800/80 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 border-slate-700/60 hover:border-indigo-500/30"
                      }`}
                    >
                      <BookOpen className={`w-3 h-3 ${hwpDoc ? "text-sky-400" : "text-indigo-400"}`} />
                      {hwpDoc ? "🧩 rhwp 본문/편집" : "본문/편집"}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      onTriggerChatPrompt?.(
                        `Google Drive에서 '${f.name}' 파일의 본문을 읽어서 핵심 내용을 3줄로 요약하고 주요 액션 아이템을 정리해 줘.`
                      )
                    }
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/60 hover:border-cyan-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-cyan-400" />
                    AI 요약
                  </button>
                  <button
                    onClick={() =>
                      onTriggerChatPrompt?.(
                        `Google Drive의 '${f.name}' 문서${
                          f.webViewLink ? `(${f.webViewLink})` : ""
                        }를 요약해서 Google Chat 스페이스로 공유 카드를 보내줘.`
                      )
                    }
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700/60 hover:border-amber-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                  >
                    <MessageCircle className="w-3 h-3 text-amber-400" />
                    Chat 공유
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create New Google Doc / Sheet / HWP / HWPX / Markdown */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                새 Google Drive 문서 / 한글 문서(.hwpx·.hwp) / 시트 생성
              </h4>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleCreateDoc} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">문서 제목 *</label>
                  <input
                    type="text"
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="예: 2026년 11월 사업계획서.hwpx"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">문서 종류</label>
                  <select
                    value={docType}
                    onChange={(e) =>
                      setDocType(
                        e.target.value as
                          | "google_doc"
                          | "google_sheet"
                          | "google_slide"
                          | "hwpx"
                          | "hwp"
                          | "markdown"
                          | "text"
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="google_doc">📄 Google 문서 (Docs)</option>
                    <option value="hwpx">🟦 한글 표준 문서 (.hwpx · rhwp 연동)</option>
                    <option value="hwp">🟦 한글 문서 (.hwp · rhwp 연동)</option>
                    <option value="google_sheet">📊 Google 시트 (Sheets)</option>
                    <option value="google_slide">📽️ 프레젠테이션 (Slides)</option>
                    <option value="markdown">📝 Markdown (.md)</option>
                    <option value="text">📃 텍스트 (.txt)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">설명 메모 (선택)</label>
                <input
                  type="text"
                  value={docDesc}
                  onChange={(e) => setDocDesc(e.target.value)}
                  placeholder="예: 크롬 rhwp 확장프로그램으로 열람·편집 가능한 한글 문서"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  초기 본문 내용 (Google 시트 선택 시 CSV, 한글 .hwp/.hwpx 선택 시 본문 텍스트 입력)
                </label>
                <textarea
                  rows={6}
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="문서 본문 내용을 입력하세요..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  Google Drive에 생성하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Create New Folder */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-400" />
                새 Google Drive 폴더 만들기
              </h4>
              <button
                onClick={() => setShowFolderModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">폴더 이름 *</label>
                <input
                  type="text"
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="예: 2026 프로젝트 자료실"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">폴더 설명 (선택)</label>
                <input
                  type="text"
                  value={folderDesc}
                  onChange={(e) => setFolderDesc(e.target.value)}
                  placeholder="설명 메모"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-500"
                >
                  폴더 생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Document Reader & Live Editor (with dedicated Chrome `rhwp` Extension HWP/HWPX Viewer & Editor) */}
      {showReaderModal && activeFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {getFileIcon(activeFile.mimeType, activeFile.name)}
                <h4 className="text-sm font-bold text-slate-100 truncate">
                  {activeFile.name}
                </h4>
                {isHwpOrHwpx(activeFile) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold shrink-0">
                    🧩 크롬 rhwp 확장프로그램 연동 모드 (.hwp / .hwpx)
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowReaderModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs shrink-0"
              >
                닫기
              </button>
            </div>

            {/* Dedicated Chrome `rhwp` Extension Integration Banner for .hwp / .hwpx */}
            {isHwpOrHwpx(activeFile) && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/60 via-slate-950 to-indigo-950/50 border border-sky-500/30 space-y-3 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-0.5">
                    <p className="text-sky-200 font-bold flex items-center gap-1.5">
                      <span>🟦 한글 문서 (.hwp / .hwpx) — 크롬 rhwp 확장프로그램 본문/편집</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      확장자가 <code>.hwp</code> 또는 <code>.hwpx</code>인 파일은 전용 <code>.hwp</code> 스트림 URL을 통해 크롬 <strong>rhwp</strong> 확장프로그램이 즉시 가로채어 원본 한글 서식 그대로 본문 열람 및 편집을 수행합니다.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleLaunchRhwpExtension(activeFile)}
                      className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-lg shadow-sky-600/25 flex items-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      🚀 크롬 rhwp 확장프로그램으로 열기/편집
                    </button>

                    {activeFile.webViewLink && (
                      <a
                        href={activeFile.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1.5 transition-all"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        Drive 웹 뷰어(rhwp)
                      </a>
                    )}

                    <a
                      href={getRhwpStreamUrl(activeFile, true)}
                      download={activeFile.name}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5 transition-all"
                    >
                      원본 다운로드
                    </a>
                  </div>
                </div>

                {/* View Mode Switcher for HWP/HWPX */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    {[
                      { id: "rhwp_ split", label: "🧩 rhwp 뷰어 + 본문 편집 (통합)" },
                      { id: "text_edit", label: "📝 한글 본문 텍스트 직접 편집" },
                      { id: "rhwp_frame", label: "🖥️ rhwp 임베드 전체 화면" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setHwpEditorTab(
                            t.id as "rhwp_ split" | "text_edit" | "rhwp_frame"
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                          hwpEditorTab === t.id
                            ? "bg-sky-600 text-white"
                            : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Optional Custom chrome-extension:// URL template */}
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400">rhwp 확장 URL(선택):</span>
                    <input
                      type="text"
                      value={customRhwpExtUrl}
                      onChange={(e) => {
                        setCustomRhwpExtUrl(e.target.value);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem(
                            "junior_rhwp_ext_url",
                            e.target.value
                          );
                        }
                      }}
                      placeholder="기본값: 자동 .hwp 스트림 연동 (또는 chrome-extension://ID/viewer.html)"
                      className="w-60 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono text-[10px] focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {loadingReader ? (
              <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span>Google Drive에서 문서 본문을 읽어오는 중입니다...</span>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {isHwpOrHwpx(activeFile) && hwpEditorTab === "rhwp_frame" ? (
                  <div className="space-y-2">
                    <div className="w-full h-[460px] rounded-xl overflow-hidden border border-sky-500/30 bg-slate-950">
                      <iframe
                        src={getRhwpStreamUrl(activeFile, false)}
                        title={`rhwp-${activeFile.name}`}
                        className="w-full h-full border-0"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      💡 크롬 브라우저의 확장프로그램 보안 정책에 따라 임베드 프레임 대신 새 탭에서 열리는 경우 상단의 <strong>[🚀 크롬 rhwp 확장프로그램으로 열기/편집]</strong> 버튼을 클릭하세요.
                    </p>
                  </div>
                ) : isHwpOrHwpx(activeFile) && hwpEditorTab === "rhwp_ split" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-sky-300 font-semibold">
                        <span>🧩 크롬 rhwp 스트림 뷰어 프레임 ({activeFile.name})</span>
                        <a
                          href={getRhwpStreamUrl(activeFile, false)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-sky-200"
                        >
                          새 탭에서 크게 열기 ↗
                        </a>
                      </div>
                      <div className="w-full h-[320px] rounded-xl overflow-hidden border border-sky-500/30 bg-slate-950 flex flex-col">
                        <iframe
                          src={getRhwpStreamUrl(activeFile, false)}
                          title={`rhwp-split-${activeFile.name}`}
                          className="w-full flex-1 border-0"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-300 font-semibold">
                        <span>📝 한글 문서 본문 추출 / 직접 텍스트 편집기</span>
                        <span className="text-[10px] text-slate-500">
                          수정 후 저장 시 Google Drive에 즉시 반영됩니다
                        </span>
                      </div>
                      <textarea
                        rows={13}
                        value={readerContent}
                        onChange={(e) => setReaderContent(e.target.value)}
                        placeholder="한글 문서(.hwp/.hwpx) 본문 텍스트를 직접 입력·편집할 수 있습니다."
                        className="w-full h-[320px] p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    rows={12}
                    value={readerContent}
                    onChange={(e) => setReaderContent(e.target.value)}
                    placeholder="문서 본문 내용이 비어 있거나 바이너리 파일입니다."
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-indigo-500"
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReaderModal(false);
                      onTriggerChatPrompt?.(
                        `다음은 Google Drive 문서 '${activeFile.name}'의 본문입니다. 핵심 내용을 요약하고 할 일(To-Do)이 있다면 추출해 줘:\n\n${readerContent.slice(
                          0,
                          2000
                        )}`
                      );
                    }}
                    className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Junior에게 이 본문 요약 & 분석 맡기기
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReaderModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      닫기
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveReaderContent}
                      disabled={savingReader}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 flex items-center gap-1.5"
                    >
                      {savingReader && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      본문 수정 저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal 4: Share File & Permissions (`POST /drive/v3/files/{id}/permissions`) */}
      {showShareModal && shareTargetFile && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-400" />
                &lsquo;{shareTargetFile.name}&rsquo; 공유 및 권한 설정
              </h4>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            {shareTargetFile.webViewLink && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-indigo-300 font-mono">
                  {shareTargetFile.webViewLink}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareTargetFile.webViewLink || "");
                    setStatusMessage({
                      type: "success",
                      text: "문서 링크가 클립보드에 복사되었습니다.",
                    });
                  }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 shrink-0"
                >
                  <Copy className="w-3 h-3" /> 복사
                </button>
              </div>
            )}

            <form onSubmit={handleShareSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  공유할 사용자 이메일 주소 (선택)
                </label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="예: colleague@company.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">권한 역할</label>
                <select
                  value={shareRole}
                  onChange={(e) =>
                    setShareRole(e.target.value as "reader" | "commenter" | "writer")
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="reader">뷰어 (읽기 전용)</option>
                  <option value="commenter">댓글 작성자</option>
                  <option value="writer">편집자 (수정 가능)</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={makePublicLink}
                  onChange={(e) => setMakePublicLink(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500"
                />
                링크가 있는 모든 사용자에게 보기 권한 허용
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500"
                >
                  공유 권한 적용
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Unified OAuth 2.0 / Service Account / Bearer Token Configuration */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                Google 드라이브 전체 연동 설정 (OAuth 2.0 / 서비스 계정 / 토큰)
              </h4>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                닫기
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAuthTab("oauth2")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "oauth2"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. OAuth 2.0 전체 연동
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("service_account")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "service_account"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. 서비스 계정 (JSON)
              </button>
              <button
                type="button"
                onClick={() => setAuthTab("token")}
                className={`py-2 rounded-lg font-semibold transition-all ${
                  authTab === "token"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Bearer 토큰 입력
              </button>
            </div>

            {authTab === "oauth2" && (
              <form onSubmit={handleStartOAuth} className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 space-y-1 text-[11px]">
                  <p className="text-slate-200 font-semibold">
                    ☁️ Google Drive API v3 전체 권한 연동 (Refresh Token 자동 갱신)
                  </p>
                  <p>
                    승인된 리디렉션 URI에{" "}
                    <code className="text-indigo-300">
                      {authStatus.redirectUri ||
                        "http://localhost:3000/api/auth/google-drive/callback"}
                    </code>{" "}
                    를 추가하세요. (이미 Google Chat이나 주소록에서 Client ID/Secret을 등록하셨다면 비워두고 바로 연동 버튼을 누르셔도 됩니다!)
                  </p>
                  <p className="text-slate-500">
                    요청 스코프: <code>drive</code>, <code>drive.file</code>
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
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Google OAuth Client Secret</label>
                  <input
                    type="password"
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    placeholder="GOCSPX-..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  {authStatus.hasDriveToken ? (
                    <button
                      type="button"
                      onClick={handleDisconnectAuth}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20"
                    >
                      Drive API 인증 해제
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
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                    >
                      Google 계정으로 드라이브 전체 연동하기
                    </button>
                  </div>
                </div>
              </form>
            )}

            {authTab === "service_account" && (
              <form onSubmit={handleSaveServiceAccount} className="space-y-3 text-xs">
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Google Cloud 서비스 계정(Service Account) JSON 키를 붙여넣으면 RS256 서명을 통해 Google Drive API 토큰을 자동 발급·갱신합니다.
                </p>
                <textarea
                  rows={6}
                  required
                  value={serviceAccountInput}
                  onChange={(e) => setServiceAccountInput(e.target.value)}
                  placeholder='{"type": "service_account", "project_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----\n...", "client_email": "..."}'
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
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
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                  >
                    서비스 계정 저장 및 동기화
                  </button>
                </div>
              </form>
            )}

            {authTab === "token" && (
              <form onSubmit={handleSaveToken} className="space-y-3 text-xs">
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  <code>https://www.googleapis.com/auth/drive</code> 스코프가 포함된 Bearer Access Token(<code>ya29...</code>)을 직접 입력하여 즉시 Google Drive 파일들을 동기화합니다.
                </p>
                <input
                  type="password"
                  value={accessTokenInput}
                  onChange={(e) => setAccessTokenInput(e.target.value)}
                  placeholder="ya29.a0AfH6SM..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
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
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                  >
                    토큰 저장 및 동기화
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
