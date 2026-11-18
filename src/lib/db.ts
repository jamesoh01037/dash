import fs from "fs";
import path from "path";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  dataUrl?: string; // base64 representation if relevant
  textSummary?: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCallRecord[];
  attachments?: Attachment[];
  timestamp: string;
}

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  listName?: string; // e.g., "Junior" or assistantName
  completed: boolean;
  googleTaskId?: string;
  googleTaskSyncedAt?: string;
  googleTaskListName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  category: "personal" | "preference" | "work" | "general";
  content: string;
  source: "user" | "extracted_by_agent";
  createdAt: string;
}

export interface ContactItem {
  id: string;
  resourceName?: string; // Google People API resourceName, e.g., "people/c1234567890"
  etag?: string; // Google People API etag for two-way updateContact
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  department?: string;
  notes?: string;
  photoUrl?: string;
  groups?: string[]; // e.g., ["starred", "contactGroups/myContacts", "팀원"]
  starred?: boolean;
  source:
    | "manual"
    | "gmail_sync"
    | "google_csv"
    | "agent"
    | "google_people_api"
    | "google_other"
    | "google_directory";
  updatedAt: string;
}

export interface ContactGroupItem {
  id: string;
  resourceName: string; // e.g., "contactGroups/12345"
  name: string;
  memberCount?: number;
  groupType?: "USER_CONTACT_GROUP" | "SYSTEM_CONTACT_GROUP" | string;
}

export interface GoogleContactsConfig {
  authMode?: "oauth2" | "token" | "gmail_imap";
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  connectedEmail?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
}

export interface GoogleChatMember {
  name: string; // e.g., "spaces/AAA/members/111"
  displayName: string;
  email?: string;
  role: "ROLE_MANAGER" | "ROLE_MEMBER" | string;
  type: "HUMAN" | "BOT" | string;
}

export interface GoogleChatSpace {
  id: string;
  name: string; // Friendly display name
  spaceId?: string; // e.g., "spaces/AAAABBBB"
  spaceType?: "SPACE" | "GROUP_CHAT" | "DIRECT_MESSAGE" | string;
  webhookUrl?: string; // e.g., "https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."
  description?: string;
  memberCount?: number;
  createdAt: string;
}

export interface GoogleChatMessageLog {
  id: string;
  messageName?: string; // Google Chat API resource name: "spaces/AAA/messages/BBB"
  spaceId: string;
  spaceName: string;
  sender: string;
  senderType?: "HUMAN" | "BOT";
  text: string;
  direction: "outbound" | "inbound";
  threadName?: string; // e.g., "spaces/AAA/threads/CCC"
  threadKey?: string;
  reactions?: string[];
  createdAt: string;
}

export interface GoogleChatConfig {
  authMode?: "oauth2" | "service_account" | "token" | "webhook";
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  connectedEmail?: string;
  serviceAccountJson?: string;
  connectedAt?: string;
}

export interface GoogleDriveFileItem {
  id: string;
  driveFileId?: string; // Google Drive API v3 file ID
  name: string;
  mimeType: string; // e.g., "application/vnd.google-apps.document", "application/vnd.google-apps.folder", "text/markdown"
  webViewLink?: string;
  webContentLink?: string;
  size?: number;
  starred?: boolean;
  shared?: boolean;
  parentFolderId?: string;
  ownerName?: string;
  ownerEmail?: string;
  description?: string;
  contentPreview?: string; // Local text content or cached excerpt for AI reading
  source: "google_drive_api" | "local_workspace" | "agent";
  modifiedTime: string;
}

export interface GoogleDriveConfig {
  authMode?: "oauth2" | "service_account" | "token" | "local";
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  connectedEmail?: string;
  serviceAccountJson?: string;
  storageUsageBytes?: number;
  storageLimitBytes?: number;
  connectedAt?: string;
  lastSyncedAt?: string;
}

export interface GmailConfig {
  email?: string;
  appPassword?: string;
  connectedAt?: string;
}

export interface GmailTokens {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: number;
  email?: string;
  connectedAt?: string;
}

export interface CalendarEventItem {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
  listName?: string; // e.g., "Junior" or assistantName
  sourceDocId?: string;
  sourceDocName?: string;
  googleCalendarLink?: string;
  googleCalendarSyncedAt?: string;
  createdAt: string;
}

export interface OtherPersonTaskItem {
  title: string; // 제목
  assignee: string; // 해당 일을 해야 할 사람
  deadline: string; // 기한
}

export interface AttachmentSummaryItem {
  fileName: string;
  mimeType: string;
  size?: number;
  summary: string;
}

export interface JuniorNotificationItem {
  id: string;
  type: "drive_new_shared_doc" | "gmail_new_message";
  title: string;
  fileId: string; // Drive fileId or Gmail message UID
  fileName: string; // Document name or Email Subject
  fileMimeType?: string;
  fileWebViewLink?: string;
  ownerName: string; // Document creator or Email sender name
  ownerEmail?: string; // Document creator email or Email sender address
  summary: string;
  attachmentSummaries?: AttachmentSummaryItem[]; // Attached document summaries (for Gmail or Drive)
  myTodosRegistered: Array<{
    id: string;
    title: string;
    dueDate?: string;
    priority: "low" | "medium" | "high";
    listName?: string;
  }>;
  calendarEventsRegistered: Array<{
    id: string;
    title: string;
    startTime: string;
    googleCalendarLink?: string;
    listName?: string;
  }>;
  otherPeopleTasks: OtherPersonTaskItem[];
  gmailStatus?: "archived" | "snoozed" | "spam" | "trashed";
  snoozedUntil?: string;
  snoozeLabel?: string;
  read: boolean;
  createdAt: string;
}

export interface JuniorNotificationState {
  enabled: boolean;
  intervalMinutes: number;
  initializedBaseline: boolean;
  initializedEmailBaseline?: boolean;
  processedDriveFileIds: string[];
  processedEmailIds?: string[];
  lastCheckedAt?: string;
  lastEmailCheckedAt?: string;
  watchMode?: "webhook" | "local_manual";
  webhookUrl?: string;
  gmailWatchExpiration?: string;
  gmailHistoryId?: string;
  driveChannelId?: string;
  driveResourceId?: string;
  driveChannelExpiration?: string;
  driveStartPageToken?: string;
  lastWebhookEventAt?: string;
}

export interface AppSettings {
  apiKey?: string;
  model: string;
  userName: string;
  assistantName?: string;
  authUserEmail?: string;
  authUserName?: string;
  authUserPicture?: string;
  authUserOrg?: string;
  onboardingCompleted?: boolean;
  theme: "dark" | "light" | "system";
  gmailConfig?: GmailConfig;
  googleChatConfig?: GoogleChatConfig;
  googleContactsConfig?: GoogleContactsConfig;
  googleDriveConfig?: GoogleDriveConfig;
  googleClientId?: string;
  googleClientSecret?: string;
  gmailTokens?: GmailTokens;
  emailCheckCount?: number;
  emailCheckScope?: "all_except_spam" | "inbox_only";
}

export interface ApprovalFieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
  helpText?: string;
}

export interface ApprovalAmountRule {
  minAmount: number;
  maxAmount: number | null;
  conditionLabel: string;
  steps: Array<{
    role: string;
    approverName: string;
    approverEmail?: string;
  }>;
}

export interface ApprovalTemplate {
  id: string;
  name: string;
  category: string;
  summary: string;
  whenToUse: string;
  keywords: string[];
  requiresAmount: boolean;
  executionDept: string;
  executionAssignee: string;
  executionEmail: string;
  amountRules: ApprovalAmountRule[];
  fields: ApprovalFieldDefinition[];
  mcpSource: string;
}

export interface ApprovalStepRecord {
  order: number;
  role: string;
  approverName: string;
  approverEmail?: string;
  status: "waiting" | "pending" | "approved" | "rejected";
  comment?: string;
  actedAt?: string;
}

export interface ApprovalDocumentRecord {
  id: string;
  docNumber: string;
  docTypeId: string;
  docTypeName: string;
  category: string;
  title: string;
  requesterName: string;
  requesterDept: string;
  amount?: number;
  formData: Record<string, string>;
  steps: ApprovalStepRecord[];
  currentStepOrder: number;
  status: "in_progress" | "approved" | "rejected";
  executionDept: string;
  executionAssignee: string;
  executionEmail?: string;
  executionDeliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  sessions: ChatSession[];
  messages: ChatMessage[];
  todos: TodoItem[];
  calendarEvents: CalendarEventItem[];
  memories: MemoryItem[];
  contacts: ContactItem[];
  contactGroups: ContactGroupItem[];
  googleChatSpaces: GoogleChatSpace[];
  googleChatMessages: GoogleChatMessageLog[];
  googleDriveFiles: GoogleDriveFileItem[];
  notifications: JuniorNotificationItem[];
  notificationState: JuniorNotificationState;
  approvalTemplates?: ApprovalTemplate[];
  approvalDocuments?: ApprovalDocumentRecord[];
  settings: AppSettings;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "store.json");

const defaultData: DatabaseSchema = {
  sessions: [
    {
      id: "default-session",
      title: "Junior와의 첫 번째 대화",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  messages: [
    {
      id: "welcome-msg",
      sessionId: "default-session",
      role: "assistant",
      content:
        "안녕하세요! 저는 개인 전담 AI 비서 **Junior**입니다. 🚀\n\n일상적인 대화부터 할 일/일정 정리, 실시간 웹 검색, 문서 분석까지 든든하게 도와드릴게요.\n우측 상단 설정(⚙️)에서 이름을 지정하시면 맞춤 호칭으로 불러드립니다. 무엇부터 시작해 볼까요?",
      timestamp: new Date().toISOString(),
    },
  ],
  todos: [
    {
      id: "todo-sample-1",
      title: "Junior와 대화하며 할 일 관리 테스트하기",
      description: "예: '내일 아침 10시 팀 미팅 추가해줘'라고 말해보세요",
      priority: "high",
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "todo-sample-2",
      title: "Gemini API 키 등록하기",
      description: "우측 상단 설정 아이콘에서 나만의 Gemini API 키를 등록할 수 있습니다",
      priority: "medium",
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  calendarEvents: [],
  memories: [
    {
      id: "mem-1",
      category: "personal",
      content: "사용자의 전담 비서 이름은 Junior입니다.",
      source: "extracted_by_agent",
      createdAt: new Date().toISOString(),
    },
    {
      id: "mem-2",
      category: "work",
      content: "현재 Next.js 기반의 개인 전담 에이전트 Webapp 'Junior' 프로젝트를 함께 개발 중입니다.",
      source: "extracted_by_agent",
      createdAt: new Date().toISOString(),
    },
  ],
  contacts: [],
  contactGroups: [],
  googleChatSpaces: [],
  googleChatMessages: [],
  googleDriveFiles: [],
  notifications: [],
  notificationState: {
    enabled: true,
    intervalMinutes: 5,
    initializedBaseline: false,
    processedDriveFileIds: [],
  },
  settings: {
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    userName: process.env.USER_NAME || "사용자",
    assistantName: "Junior",
    onboardingCompleted: false,
    theme: "dark",
  },
};

export function getDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), "utf-8");
      return defaultData;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.todos) parsed.todos = [];
    if (!parsed.calendarEvents) parsed.calendarEvents = [];
    for (const t of parsed.todos) {
      if (!t.listName) t.listName = "Junior";
    }
    for (const ev of parsed.calendarEvents) {
      if (!ev.listName) ev.listName = "Junior";
    }
    if (!parsed.contacts) parsed.contacts = [];
    if (!parsed.contactGroups) parsed.contactGroups = [];
    if (!parsed.googleChatSpaces) parsed.googleChatSpaces = [];
    if (!parsed.googleChatMessages) parsed.googleChatMessages = [];
    if (!parsed.googleDriveFiles) parsed.googleDriveFiles = [];
    if (!parsed.notifications) parsed.notifications = [];
    if (!parsed.notificationState) {
      parsed.notificationState = {
        enabled: true,
        intervalMinutes: 5,
        initializedBaseline: false,
        processedDriveFileIds: [],
      };
    }
    return parsed;
  } catch (error) {
    console.error("Failed to read DB file, falling back to default:", error);
    return defaultData;
  }
}

export function saveDb(data: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    console.error("Failed to write to DB file:", error);
  }
}
