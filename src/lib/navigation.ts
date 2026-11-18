export type PlaceholderTab =
  | "jd_kpi"
  | "mis_finance"
  | "mis_hr"
  | "mis_performance"
  | "mis_sales"
  | "mis_company"
  | "gw_approval"
  | "gw_received_approval"
  | "gw_purchase"
  | "gw_notice"
  | "pms_rnd"
  | "pms_project"
  | "knowledge";

export type AppTab =
  | "chat"
  | "todos"
  | "memory"
  | "notifications"
  | "gmail"
  | "contacts"
  | "gchat"
  | "gdrive"
  | PlaceholderTab;

export const PLACEHOLDER_TAB_META: Record<
  PlaceholderTab,
  { category: string; title: string; subtitle: string; description: string }
> = {
  jd_kpi: {
    category: "Personal Work",
    title: "JD&KPI",
    subtitle: "개인 직무기술서(JD) 및 핵심성과지표(KPI) 관리",
    description:
      "담당 직무(JD)와 분기·연간 KPI 목표 및 달성 현황을 확인하고 관리할 수 있는 화면이 준비될 예정입니다.",
  },
  mis_finance: {
    category: "MIS",
    title: "자금 / 회계",
    subtitle: "자금 현황, 예산 집행 및 회계 관리",
    description:
      "법인 자금 수지, 비용 집행, 회계 전표 및 재무 지표를 조회하는 MIS 자금/회계 모듈이 연동될 예정입니다.",
  },
  mis_hr: {
    category: "MIS",
    title: "인사",
    subtitle: "조직도, 임직원 현황 및 인사 관리",
    description:
      "임직원 인사 정보, 근태 및 조직 현황을 조회하고 관리하는 MIS 인사 모듈이 연동될 예정입니다.",
  },
  mis_performance: {
    category: "MIS",
    title: "실적평가",
    subtitle: "조직 및 개인 실적 평가 현황",
    description:
      "사업부·팀·개인별 실적 평가 지표와 평가 결과를 확인하는 MIS 실적평가 모듈이 연동될 예정입니다.",
  },
  mis_sales: {
    category: "MIS",
    title: "영업관리",
    subtitle: "영업 파이프라인, 고객사 및 수주 현황 관리",
    description:
      "잠재 고객 발굴부터 견적·수주·매출 목표 달성 현황까지 영업 전반을 조회하고 관리하는 MIS 영업관리 모듈이 연동될 예정입니다.",
  },
  mis_company: {
    category: "MIS",
    title: "회사정보",
    subtitle: "회사 기본 정보 및 주요 현황",
    description:
      "법인 기본 정보, 주요 공시·인증 현황 및 사내 공통 기준 정보를 확인하는 화면이 연동될 예정입니다.",
  },
  gw_approval: {
    category: "Groupware",
    title: "전자결재",
    subtitle: "전자결재 기안·승인 및 결재선 관리",
    description:
      "결재 대기 문서, 진행 중인 기안 및 완료된 전자결재 이력을 처리하는 전자결재 화면입니다.",
  },
  gw_received_approval: {
    category: "Groupware",
    title: "내가 받은 결재",
    subtitle: "나에게 결재가 요청된 문서 검토 및 승인·반려",
    description:
      "결재선에 내가 포함되어 요청된 결재 문서를 확인하고 승인 또는 반려를 처리합니다.",
  },
  gw_purchase: {
    category: "Groupware",
    title: "구매",
    subtitle: "구매 요청, 발주 및 검수 관리",
    description:
      "물품·용역 구매 요청(PR), 발주(PO) 및 진행 상태를 조회하고 신청하는 구매 모듈이 연동될 예정입니다.",
  },
  gw_notice: {
    category: "Groupware",
    title: "Notice & BBS",
    subtitle: "사내 공지사항 및 자유 게시판",
    description:
      "전사 공지사항과 부서별 게시판(BBS) 새 글을 확인하고 작성할 수 있는 화면이 연동될 예정입니다.",
  },
  pms_rnd: {
    category: "PMS",
    title: "R&D",
    subtitle: "연구개발 과제 및 정부과제 관리",
    description:
      "진행 중인 R&D 연구개발 과제, 마일스톤, 산출물 및 사업비 현황을 관리하는 PMS R&D 모듈이 연동될 예정입니다.",
  },
  pms_project: {
    category: "PMS",
    title: "Project",
    subtitle: "수행 프로젝트 일정 및 진척 관리",
    description:
      "고객·내부 프로젝트의 WBS, 일정, 투입 리소스 및 이슈 현황을 관리하는 PMS Project 모듈이 연동될 예정입니다.",
  },
  knowledge: {
    category: "Knowledge",
    title: "Knowledge",
    subtitle: "사내 지식 베이스 및 문서 아카이브",
    description:
      "업무 매뉴얼, 회의록, 기술 문서 및 AI 학습 지식 자산을 통합 검색·관리하는 Knowledge 허브가 연동될 예정입니다.",
  },
};
