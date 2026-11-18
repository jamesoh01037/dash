import {
  ApprovalDocumentRecord,
  ApprovalFieldDefinition,
  ApprovalAmountRule,
  ApprovalTemplate,
  getDb,
} from "@/lib/db";

export type { ApprovalFieldDefinition, ApprovalAmountRule, ApprovalTemplate };
export { resolveApprovalSteps } from "@/lib/approvalRules";

export const DEFAULT_APPROVAL_TEMPLATES: ApprovalTemplate[] = [
  {
    id: "general-proposal",
    name: "일반 품의서",
    category: "경영/기획",
    summary: "프로젝트 추진, 외부 계약, 신규 정책 도입 등 사전 의사결정이 필요한 건에 대한 품의 문서",
    whenToUse: "예산 집행 전 사전 승인, 외부 업체 계약 체결, 신규 사업·행사 기획 승인 요청 시",
    keywords: ["품의", "계약", "추진", "기획", "행사", "외부", "승인", "제휴", "컨퍼런스"],
    requiresAmount: true,
    executionDept: "경영지원팀",
    executionAssignee: "이수진 매니저",
    executionEmail: "finance@i-on.net",
    mcpSource: "mcp://company-policy/approvals/general-proposal",
    amountRules: [
      {
        minAmount: 0,
        maxAmount: 999999,
        conditionLabel: "100만 원 미만 (팀장 전결)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
        ],
      },
      {
        minAmount: 1000000,
        maxAmount: 4999999,
        conditionLabel: "100만 원 이상 ~ 500만 원 미만 (팀장 → 본부장)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "사업 본부장", approverName: "최민수 본부장" },
        ],
      },
      {
        minAmount: 5000000,
        maxAmount: null,
        conditionLabel: "500만 원 이상 (팀장 → 본부장 → 대표이사)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "사업 본부장", approverName: "최민수 본부장" },
          { role: "대표이사", approverName: "James 대표" },
        ],
      },
    ],
    fields: [
      {
        key: "purpose",
        label: "품의 목적 및 배경",
        type: "textarea",
        required: true,
        placeholder: "추진 배경과 기대 효과를 구체적으로 입력하세요.",
      },
      {
        key: "detail",
        label: "세부 추진 내용",
        type: "textarea",
        required: true,
        placeholder: "일정, 대상, 추진 방식 등 주요 내용을 입력하세요.",
      },
      {
        key: "targetDate",
        label: "시행(예정) 일자",
        type: "date",
        required: true,
      },
      {
        key: "vendor",
        label: "관련 거래처 / 기관",
        type: "text",
        required: false,
        placeholder: "해당 시 업체명 또는 기관명 입력",
      },
      {
        key: "note",
        label: "특이사항 / 참고 메모",
        type: "textarea",
        required: false,
        placeholder: "추가 첨부 또는 참고 사항 (선택)",
      },
    ],
  },
  {
    id: "expense-resolution",
    name: "지출결의서",
    category: "재무/회계",
    summary: "회의비, 출장비, 학회 참가비, 대금 정산 등 실제 비용 지출 및 지급 처리를 위한 결재 문서",
    whenToUse: "법인카드 정산, 개인 경비 청구, 세금계산서 대금 지급, 학회·세미나 참가비 결제 요청 시",
    keywords: ["지출", "결제", "정산", "회의비", "참가비", "경비", "영수증", "입금", "세금계산서", "비용"],
    requiresAmount: true,
    executionDept: "재무회계팀",
    executionAssignee: "김현우 과장",
    executionEmail: "accounting@i-on.net",
    mcpSource: "mcp://company-policy/approvals/expense-resolution",
    amountRules: [
      {
        minAmount: 0,
        maxAmount: 499999,
        conditionLabel: "50만 원 미만 (팀장 → 재무검토)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "재무검토", approverName: "김현우 과장" },
        ],
      },
      {
        minAmount: 500000,
        maxAmount: 2999999,
        conditionLabel: "50만 원 이상 ~ 300만 원 미만 (팀장 → 본부장 → 재무검토)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "사업 본부장", approverName: "최민수 본부장" },
          { role: "재무검토", approverName: "김현우 과장" },
        ],
      },
      {
        minAmount: 3000000,
        maxAmount: null,
        conditionLabel: "300만 원 이상 (팀장 → 본부장 → 대표이사)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "사업 본부장", approverName: "최민수 본부장" },
          { role: "대표이사", approverName: "James 대표" },
        ],
      },
    ],
    fields: [
      {
        key: "expenseCategory",
        label: "계정 과목 / 비용 구분",
        type: "select",
        required: true,
        options: ["과제 회의비", "여비교통비", "교육/학회 참가비", "복리후생비", "외주용역비", "기타 운영비"],
      },
      {
        key: "paymentMethod",
        label: "결제 수단",
        type: "select",
        required: true,
        options: ["법인카드", "계좌이체(세금계산서)", "개인카드 선지출 정산"],
      },
      {
        key: "usageDate",
        label: "사용 / 지급 요청일",
        type: "date",
        required: true,
      },
      {
        key: "payee",
        label: "지급처 / 가맹점",
        type: "text",
        required: true,
        placeholder: "지급 대상 업체명 또는 기관명",
      },
      {
        key: "breakdown",
        label: "지출 상세 내역",
        type: "textarea",
        required: true,
        placeholder: "단가, 수량, 참석자 등 증빙 기준 내역을 입력하세요.",
      },
      {
        key: "projectCode",
        label: "관련 과제 / 프로젝트 코드",
        type: "text",
        required: false,
        placeholder: "예: RND-2026-04 (선택)",
      },
    ],
  },
  {
    id: "purchase-request",
    name: "구매요청서",
    category: "구매/자산",
    summary: "IT 장비, 소프트웨어 라이선스, 사무 비품 및 용역 발주를 위한 사전 구매 승인 문서",
    whenToUse: "노트북·모니터 등 비품 구매, SaaS/소프트웨어 구독, 외주 용역 발주 필요 시",
    keywords: ["구매", "발주", "장비", "노트북", "소프트웨어", "라이선스", "구독", "비품", "견적"],
    requiresAmount: true,
    executionDept: "총무구매팀",
    executionAssignee: "정다은 대리",
    executionEmail: "procurement@i-on.net",
    mcpSource: "mcp://company-policy/approvals/purchase-request",
    amountRules: [
      {
        minAmount: 0,
        maxAmount: 999999,
        conditionLabel: "100만 원 미만 (팀장 → 구매담당)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "구매검토", approverName: "정다은 대리" },
        ],
      },
      {
        minAmount: 1000000,
        maxAmount: null,
        conditionLabel: "100만 원 이상 (팀장 → 본부장 → 대표이사)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "사업 본부장", approverName: "최민수 본부장" },
          { role: "대표이사", approverName: "James 대표" },
        ],
      },
    ],
    fields: [
      {
        key: "itemName",
        label: "구매 품목명 / 사양",
        type: "text",
        required: true,
        placeholder: "예: MacBook Pro 14 M4 / 32GB",
      },
      {
        key: "quantity",
        label: "수량",
        type: "number",
        required: true,
        placeholder: "1",
      },
      {
        key: "desiredDate",
        label: "희망 납기일",
        type: "date",
        required: true,
      },
      {
        key: "reason",
        label: "구매 사유",
        type: "textarea",
        required: true,
        placeholder: "업무 필요성 및 기존 자산 교체 여부를 입력하세요.",
      },
      {
        key: "quoteVendor",
        label: "추천 공급사 / 견적처",
        type: "text",
        required: false,
        placeholder: "비교 견적 업체가 있는 경우 입력",
      },
    ],
  },
  {
    id: "leave-travel-request",
    name: "휴가 / 출장 신청서",
    category: "인사/근태",
    summary: "연차·반차·병가 및 국내외 출장 일정 승인을 위한 근태 결재 문서",
    whenToUse: "연차/반차 휴가 신청, 국내·해외 출장 사전 승인 및 여비 기준 확인 시",
    keywords: ["휴가", "연차", "반차", "출장", "외근", "근태", "병가"],
    requiresAmount: false,
    executionDept: "인사총무팀",
    executionAssignee: "한지민 매니저",
    executionEmail: "hr@i-on.net",
    mcpSource: "mcp://company-policy/approvals/leave-travel-request",
    amountRules: [
      {
        minAmount: 0,
        maxAmount: null,
        conditionLabel: "금액 무관 (소속 팀장 → 본부장)",
        steps: [
          { role: "소속 팀장", approverName: "박지훈 팀장" },
          { role: "사업 본부장", approverName: "최민수 본부장" },
        ],
      },
    ],
    fields: [
      {
        key: "requestType",
        label: "신청 구분",
        type: "select",
        required: true,
        options: ["연차", "오전 반차", "오후 반차", "국내 출장", "해외 출장"],
      },
      {
        key: "startDate",
        label: "시작일",
        type: "date",
        required: true,
      },
      {
        key: "endDate",
        label: "종료일",
        type: "date",
        required: true,
      },
      {
        key: "destinationOrReason",
        label: "사유 / 출장지 및 목적",
        type: "textarea",
        required: true,
        placeholder: "출장지·방문기관 또는 휴가 사유를 입력하세요.",
      },
      {
        key: "handover",
        label: "업무 대행자 / 비상 연락처",
        type: "text",
        required: false,
        placeholder: "부재 시 긴급 연락 가능한 동료 또는 연락처",
      },
    ],
  },
];

/**
 * Fetches approval document definitions from the configured MCP server if available,
 * otherwise falls back to the built-in policy definitions.
 */
export async function fetchApprovalTemplatesFromMcp(): Promise<{
  templates: ApprovalTemplate[];
  source: "remote_mcp" | "builtin_mcp_schema";
}> {
  const mcpUrl = process.env.APPROVAL_MCP_URL;
  if (mcpUrl) {
    try {
      const res = await fetch(mcpUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { templates?: ApprovalTemplate[] };
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          return { templates: data.templates, source: "remote_mcp" };
        }
      }
    } catch {
      // Fallback to local/built-in policy definitions when MCP endpoint is unreachable
    }
  }
  const db = getDb();
  if (Array.isArray(db.approvalTemplates) && db.approvalTemplates.length > 0) {
    return { templates: db.approvalTemplates, source: "builtin_mcp_schema" };
  }
  return { templates: DEFAULT_APPROVAL_TEMPLATES, source: "builtin_mcp_schema" };
}

export function recommendApprovalTemplates(
  templates: ApprovalTemplate[],
  query: string
): ApprovalTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return templates;
  const scored = templates
    .map((t) => {
      let score = 0;
      for (const kw of t.keywords) {
        if (q.includes(kw.toLowerCase())) score += 2;
      }
      if (q.includes(t.name.toLowerCase())) score += 3;
      return { template: t, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored.map((s) => s.template) : templates;
}

export function buildApprovalStats(docs: ApprovalDocumentRecord[]) {
  const totalCount = docs.length;
  const inProgressCount = docs.filter((d) => d.status === "in_progress").length;
  const approvedCount = docs.filter((d) => d.status === "approved").length;
  const rejectedCount = docs.filter((d) => d.status === "rejected").length;
  const totalAmount = docs.reduce((sum, d) => sum + (d.amount || 0), 0);
  const approvedAmount = docs
    .filter((d) => d.status === "approved")
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const byDocTypeMap = new Map<
    string,
    {
      docTypeId: string;
      docTypeName: string;
      count: number;
      approvedCount: number;
      inProgressCount: number;
      rejectedCount: number;
      totalAmount: number;
    }
  >();

  for (const d of docs) {
    const existing = byDocTypeMap.get(d.docTypeId) || {
      docTypeId: d.docTypeId,
      docTypeName: d.docTypeName,
      count: 0,
      approvedCount: 0,
      inProgressCount: 0,
      rejectedCount: 0,
      totalAmount: 0,
    };
    existing.count += 1;
    if (d.status === "approved") existing.approvedCount += 1;
    else if (d.status === "in_progress") existing.inProgressCount += 1;
    else if (d.status === "rejected") existing.rejectedCount += 1;
    existing.totalAmount += d.amount || 0;
    byDocTypeMap.set(d.docTypeId, existing);
  }

  return {
    totalCount,
    inProgressCount,
    approvedCount,
    rejectedCount,
    totalAmount,
    approvedAmount,
    deliveredCount: docs.filter((d) => Boolean(d.executionDeliveredAt)).length,
    byDocType: Array.from(byDocTypeMap.values()),
  };
}
