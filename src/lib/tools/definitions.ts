import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

export const searchWebDeclaration: FunctionDeclaration = {
  name: "search_web",
  description: "인터넷 웹 검색을 통해 최신 뉴스, 날씨, 기술 자료, 실시간 정보 등을 검색합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "검색할 키워드 또는 질의문",
      },
    },
    required: ["query"],
  },
};

export const manageTodosDeclaration: FunctionDeclaration = {
  name: "manage_todos",
  description:
    "사용자의 할 일(To-Do) 및 일정을 'Junior' 목록에 추가, 조회, 완료 또는 삭제합니다. Junior가 할 일이나 일정을 등록할 때는 항상 'Junior' 목록(listName: 'Junior')에 등록합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description:
          "수행할 작업: 'add' (할일 추가 - 'Junior' 목록에 등록), 'add_schedule' (일정 추가 - 'Junior' 목록에 등록), 'list' (목록 조회), 'complete' (완료 처리), 'delete' (삭제)",
      },
      title: {
        type: SchemaType.STRING,
        description: "할 일 또는 일정 제목 (action이 'add' 또는 'add_schedule'일 때 필수)",
      },
      description: {
        type: SchemaType.STRING,
        description: "상세 메모나 설명 (선택)",
      },
      priority: {
        type: SchemaType.STRING,
        description: "중요도: 'low', 'medium', 'high' (기본값: 'medium')",
      },
      dueDate: {
        type: SchemaType.STRING,
        description: "마감일시 또는 일정 일시 (예: '2026-11-15 15:00', '내일 오후 2시')",
      },
      listName: {
        type: SchemaType.STRING,
        description: "등록할 할 일/일정 목록 이름 (기본값: 'Junior' — Junior가 등록할 때는 항상 'Junior' 사용)",
      },
      itemType: {
        type: SchemaType.STRING,
        description: "항목 구분: 'todo' (해야 할 일) 또는 'schedule' (일정/캘린더)",
      },
      location: {
        type: SchemaType.STRING,
        description: "일정 장소 (itemType이 'schedule'이거나 action이 'add_schedule'일 때 선택)",
      },
      todoId: {
        type: SchemaType.STRING,
        description: "완료 처리 또는 삭제할 대상 할 일/일정의 ID (또는 제목)",
      },
    },
    required: ["action"],
  },
};

export const manageMemoryDeclaration: FunctionDeclaration = {
  name: "manage_memory",
  description: "사용자에 대한 중요한 사실, 선호도, 개인 정보, 프로젝트 상황을 장기 기억으로 저장하거나 조회합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description: "수행할 작업: 'save' (새 기억 저장), 'list' (저장된 기억 목록 확인), 'delete' (기억 삭제)",
      },
      content: {
        type: SchemaType.STRING,
        description: "저장할 기억 내용 (예: '선호하는 원두는 에티오피아 예가체프이다', '주말마다 러닝을 한다')",
      },
      category: {
        type: SchemaType.STRING,
        description: "분류: 'personal', 'preference', 'work', 'general'",
      },
      memoryId: {
        type: SchemaType.STRING,
        description: "삭제할 기억의 ID",
      },
    },
    required: ["action"],
  },
};

export const manageGmailDeclaration: FunctionDeclaration = {
  name: "manage_gmail",
  description:
    "사용자의 Gmail 이메일을 조회, 읽기, 답장/새 메일 초안 작성, 메일 발송, 또는 메일 속 약속/미팅 일정을 감지합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description:
          "수행할 작업: 'list' (메일 목록/검색), 'read' (메일 본문 읽기), 'draft' (초안 저장), 'send' (메일 발송), 'detect_schedule' (메일 속 회의/일정 추출)",
      },
      query: {
        type: SchemaType.STRING,
        description: "메일 검색 쿼리 (예: 'is:unread', 'from:google', '미팅', 기본값: 'is:unread')",
      },
      emailId: {
        type: SchemaType.STRING,
        description: "상세 내용을 읽거나 일정을 추출할 대상 이메일의 ID",
      },
      to: {
        type: SchemaType.STRING,
        description: "메일 수신자 이메일 주소 (action이 'draft' 또는 'send'일 때 필수)",
      },
      subject: {
        type: SchemaType.STRING,
        description: "메일 제목 (action이 'draft' 또는 'send'일 때 필수)",
      },
      body: {
        type: SchemaType.STRING,
        description: "메일 본문 내용 (action이 'draft' 또는 'send'일 때 필수)",
      },
      maxResults: {
        type: SchemaType.NUMBER,
        description: "조회할 최대 메일 개수 (기본값: 5, 최대: 15)",
      },
    },
    required: ["action"],
  },
};

export const manageContactsDeclaration: FunctionDeclaration = {
  name: "manage_contacts",
  description:
    "사용자의 Google 주소록(People API v1 & Gmail 연락처) 전체 기능을 제어합니다: 연락처 및 Workspace 조직 디렉터리 실시간 검색, 전체/그룹별 조회, 양방향 클라우드 연락처 생성·수정·삭제, People API 전체 동기화, Gmail 교류 연락처 추출, 그룹(라벨) 관리 및 즐겨찾기 설정을 수행합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description:
          "수행할 작업: 'search' (연락처 및 조직 디렉터리 실시간 검색), 'list' (전체/그룹별 주소록 조회), 'add' (연락처 추가 + People API 양방향 생성), 'update' (연락처 수정 + People API 양방향 반영), 'delete' (연락처 삭제), 'sync_google_people' (Google People API 클라우드 주소록 전체 동기화), 'sync_gmail' (Gmail 수발신 연락처 자동 추출), 'list_groups' (주소록 라벨/그룹 목록 조회), 'create_group' (새 주소록 라벨/그룹 생성), 'toggle_favorite' (별표/즐겨찾기 토글)",
      },
      query: {
        type: SchemaType.STRING,
        description: "검색할 이름, 이메일, 소속, 부서 또는 키워드 ('search' 시 사용)",
      },
      name: {
        type: SchemaType.STRING,
        description: "연락처 이름 또는 생성할 그룹 이름 (예: '김철수', 'VIP 고객')",
      },
      email: {
        type: SchemaType.STRING,
        description: "이메일 주소",
      },
      phone: {
        type: SchemaType.STRING,
        description: "전화번호 (선택)",
      },
      company: {
        type: SchemaType.STRING,
        description: "회사/소속명 (선택)",
      },
      role: {
        type: SchemaType.STRING,
        description: "직급/직책 (선택)",
      },
      department: {
        type: SchemaType.STRING,
        description: "부서명 (선택)",
      },
      notes: {
        type: SchemaType.STRING,
        description: "관련 메모 (선택)",
      },
      group: {
        type: SchemaType.STRING,
        description: "소속시킬 그룹/라벨 이름 또는 필터링할 그룹명 (선택)",
      },
      starredOnly: {
        type: SchemaType.BOOLEAN,
        description: "즐겨찾기(별표)된 연락처만 조회할지 여부 ('list' 시 선택)",
      },
      contactId: {
        type: SchemaType.STRING,
        description: "수정, 삭제 또는 즐겨찾기 토글할 연락처의 ID, resourceName(people/...), 이름 또는 이메일",
      },
    },
    required: ["action"],
  },
};

export const manageGoogleChatDeclaration: FunctionDeclaration = {
  name: "manage_google_chat",
  description:
    "사용자의 Google Chat(구글 챗) OAuth 2.0 및 REST API v1 전체 기능을 제어합니다: 스페이스(채팅방/DM) 조회·생성, 참여 멤버 조회, 메시지/Cards v2 브리핑 전송, 스레드 답글, 메시지 수정·삭제, 이모지 리액션 추가, 최근 채팅 메시지 동기화를 수행합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description:
          "수행할 작업: 'list_spaces' (전체 스페이스/DM 목록 동기화·조회), 'create_space' (새 Google Chat 스페이스 생성), 'list_members' (스페이스 참여 멤버 조회), 'send_message' (메시지/리치 카드/스레드 답글 전송), 'get_messages' (최근 채팅 메시지 조회), 'update_message' (보낸 메시지 내용 수정), 'delete_message' (메시지 삭제), 'add_reaction' (메시지에 이모지 리액션 추가), 'add_space' (웹훅/스페이스 수동 등록), 'delete_space' (스페이스 연동 해제)",
      },
      spaceNameOrId: {
        type: SchemaType.STRING,
        description:
          "대상 Google Chat 스페이스 이름 또는 Space ID (생략 시 기본 스페이스로 동작, create_space 시 생성할 방 이름)",
      },
      text: {
        type: SchemaType.STRING,
        description: "전송하거나 수정할 메시지 본문 내용 ('send_message', 'update_message' 시 필수)",
      },
      title: {
        type: SchemaType.STRING,
        description: "리치 카드(Card v2) 헤더 제목 또는 새 스페이스 이름",
      },
      subtitle: {
        type: SchemaType.STRING,
        description: "리치 카드(Card v2) 부제목 (선택)",
      },
      buttonText: {
        type: SchemaType.STRING,
        description: "리치 카드 하단 링크 버튼 텍스트 (예: '회의록 열기', 선택)",
      },
      buttonUrl: {
        type: SchemaType.STRING,
        description: "리치 카드 하단 링크 버튼 클릭 시 이동할 URL (선택)",
      },
      useCard: {
        type: SchemaType.BOOLEAN,
        description: "Google Chat Cards v2 포맷으로 전송할지 여부 (브리핑/요약 전송 시 true 권장)",
      },
      threadName: {
        type: SchemaType.STRING,
        description: "특정 스레드에 답글로 달 때 대상 스레드 리소스 이름 (예: 'spaces/AAA/threads/BBB')",
      },
      threadKey: {
        type: SchemaType.STRING,
        description: "커스텀 스레드 키 (동일 키로 연속 답글 묶기 지원)",
      },
      messageName: {
        type: SchemaType.STRING,
        description:
          "수정('update_message'), 삭제('delete_message'), 또는 리액션('add_reaction')할 대상 메시지 리소스 이름 (예: 'spaces/AAA/messages/BBB')",
      },
      emoji: {
        type: SchemaType.STRING,
        description: "추가할 유니코드 이모지 (예: '👍', '✅', '❤️', '🚀', action이 'add_reaction'일 때 사용)",
      },
      memberEmails: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
        description: "새 스페이스 생성('create_space') 시 함께 초대할 멤버 이메일 배열 (선택)",
      },
      webhookUrl: {
        type: SchemaType.STRING,
        description:
          "새 스페이스 수동 등록 시 Google Chat Incoming Webhook URL (https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...)",
      },
      spaceId: {
        type: SchemaType.STRING,
        description: "Google Chat REST API 스페이스 리소스 이름 (예: 'spaces/AAAABBBB')",
      },
      description: {
        type: SchemaType.STRING,
        description: "스페이스 설명 또는 메모 (선택)",
      },
      filter: {
        type: SchemaType.STRING,
        description: "Google Chat API 메시지 필터 쿼리 (예: 'createTime > \"2026-11-14T00:00:00Z\"', 선택)",
      },
      maxResults: {
        type: SchemaType.NUMBER,
        description: "조회할 최근 메시지 개수 (기본값: 20)",
      },
    },
    required: ["action"],
  },
};

export const manageGoogleDriveDeclaration: FunctionDeclaration = {
  name: "manage_google_drive",
  description:
    "사용자의 Google Drive(구글 드라이브) OAuth 2.0 및 REST API v3 전체 기능을 제어합니다: 파일·폴더·Google 문서·한글 문서(.hwp/.hwpx, 크롬 rhwp 확장프로그램 연동) 검색 및 목록 조회, Google Docs/Sheets/HWP/HWPX/텍스트 본문 읽기·요약·편집, 새 Google 문서/시트/한글 문서(.hwpx/.hwp)/폴더 생성, 파일 수정·별표·삭제, 공유 권한 부여 및 링크 생성, 저장공간 용량 확인을 수행합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description:
          "수행할 작업: 'list_files' (드라이브 파일/폴더 목록 조회), 'search_files' (파일명/본문 키워드 검색), 'read_file' (Google Docs/Sheets/HWP/HWPX/문서 본문 내용 읽기), 'create_doc' (새 Google 문서/시트/한글 HWP·HWPX/마크다운 생성 및 저장), 'create_folder' (새 폴더 생성), 'update_file' (파일명/본문/별표 수정), 'share_file' (이메일 권한 공유 또는 공개 링크 생성), 'delete_file' (파일 삭제/휴지통 이동), 'sync_drive' (클라우드 전체 동기화), 'get_quota' (저장공간 용량 확인)",
      },
      query: {
        type: SchemaType.STRING,
        description: "검색할 파일명 또는 본문 키워드 ('search_files', 'list_files' 시 사용)",
      },
      fileIdOrName: {
        type: SchemaType.STRING,
        description: "읽기, 수정, 공유, 삭제할 대상 파일의 이름 또는 Google Drive File ID",
      },
      name: {
        type: SchemaType.STRING,
        description: "새로 생성할 문서/폴더 이름 또는 변경할 파일 이름",
      },
      content: {
        type: SchemaType.STRING,
        description: "생성하거나 수정할 문서의 텍스트/마크다운/CSV/HWP 본문 내용",
      },
      docType: {
        type: SchemaType.STRING,
        description:
          "생성할 문서 형식: 'google_doc' (Google 문서, 기본값), 'google_sheet' (스프레드시트), 'google_slide' (프레젠테이션), 'hwpx' (한글 표준 문서 .hwpx, rhwp 연동), 'hwp' (한글 문서 .hwp, rhwp 연동), 'markdown' (.md), 'text' (.txt), 'folder' (폴더)",
      },
      parentFolderId: {
        type: SchemaType.STRING,
        description: "상위 폴더 ID (선택)",
      },
      description: {
        type: SchemaType.STRING,
        description: "파일 또는 폴더 설명 메모 (선택)",
      },
      starredOnly: {
        type: SchemaType.BOOLEAN,
        description: "중요(별표) 표시된 파일만 조회할지 여부 ('list_files' 시 선택)",
      },
      starred: {
        type: SchemaType.BOOLEAN,
        description: "파일의 별표(즐겨찾기) 설정 여부 ('update_file' 시 선택)",
      },
      email: {
        type: SchemaType.STRING,
        description: "파일을 공유할 대상 이메일 주소 ('share_file' 시 선택)",
      },
      role: {
        type: SchemaType.STRING,
        description: "공유 권한: 'reader' (뷰어, 기본값), 'commenter' (댓글 작성자), 'writer' (편집자)",
      },
      makePublicLink: {
        type: SchemaType.BOOLEAN,
        description: "링크가 있는 모든 사용자에게 보기 권한을 열어 공유 링크를 만들지 여부 ('share_file' 시 선택)",
      },
    },
    required: ["action"],
  },
};

export const manageApprovalFlowDeclaration: FunctionDeclaration = {
  name: "manage_approval_flow",
  description:
    "회사의 전자결재(Approval Flow) 규정을 MCP 서버에서 조회해 상황에 맞는 결재 양식을 추천하고, 필수/선택 입력 항목과 금액별 결재선을 안내하며, 대화로 채운 결재 문서를 상신하거나 DB에 기록된 결재 통계를 조회합니다.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      action: {
        type: SchemaType.STRING,
        description:
          "수행할 작업: 'recommend_template' (상황에 맞는 결재 문서 추천), 'get_template_fields' (결재 문서의 필수/선택 입력 항목 및 금액별 결재선 조회), 'submit_approval' (결재 문서 상신 및 DB 기록), 'get_statistics' (결재 문서별 통계/현황 조회)",
      },
      situation: {
        type: SchemaType.STRING,
        description: "사용자가 설명한 업무 상황 또는 찾고자 하는 결재 키워드 ('recommend_template' 시 사용)",
      },
      docTypeId: {
        type: SchemaType.STRING,
        description:
          "결재 문서 ID 또는 이름 (예: 'general-proposal', 'expense-resolution', 'purchase-request', 'leave-travel-request' 또는 '일반 품의서', '지출결의서')",
      },
      title: {
        type: SchemaType.STRING,
        description: "상신할 결재 문서 제목 ('submit_approval' 시 필수)",
      },
      amount: {
        type: SchemaType.NUMBER,
        description: "결재 금액(원 단위 숫자). 금액 조건에 따른 결재선 산정에 사용됩니다.",
      },
      requesterDept: {
        type: SchemaType.STRING,
        description: "기안자 소속 부서명 (선택, 기본값: 사업개발팀)",
      },
      formData: {
        type: SchemaType.OBJECT,
        description: "결재 문서 양식의 각 항목 key-value 객체 ('submit_approval' 시 사용)",
      },
    },
    required: ["action"],
  },
};

export const agentTools = [
  {
    functionDeclarations: [
      searchWebDeclaration,
      manageTodosDeclaration,
      manageMemoryDeclaration,
      manageGmailDeclaration,
      manageContactsDeclaration,
      manageGoogleChatDeclaration,
      manageGoogleDriveDeclaration,
      manageApprovalFlowDeclaration,
    ],
  },
];
