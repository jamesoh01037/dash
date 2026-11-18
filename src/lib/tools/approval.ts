import { getDb, saveDb, ApprovalDocumentRecord } from "@/lib/db";
import {
  fetchApprovalTemplatesFromMcp,
  recommendApprovalTemplates,
  resolveApprovalSteps,
  buildApprovalStats,
} from "@/lib/approvalMcp";
import { generateId } from "@/lib/utils";

export interface ManageApprovalFlowArgs {
  action: "recommend_template" | "get_template_fields" | "submit_approval" | "get_statistics";
  situation?: string;
  docTypeId?: string;
  title?: string;
  amount?: number;
  requesterDept?: string;
  formData?: Record<string, string>;
}

export async function executeManageApprovalFlow(args: ManageApprovalFlowArgs) {
  const { templates, source } = await fetchApprovalTemplatesFromMcp();

  switch (args.action) {
    case "recommend_template": {
      const matched = recommendApprovalTemplates(templates, args.situation || "");
      return {
        success: true,
        mcpSource: source,
        recommendations: matched.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          summary: t.summary,
          whenToUse: t.whenToUse,
          executionDept: t.executionDept,
          executionAssignee: t.executionAssignee,
          amountRules: t.amountRules.map((r) => ({
            condition: r.conditionLabel,
            steps: r.steps.map((s) => `${s.role}(${s.approverName})`).join(" → "),
          })),
        })),
        message: `상황에 맞는 결재 문서 양식 ${matched.length}종을 MCP 규정에서 찾았습니다.`,
      };
    }

    case "get_template_fields": {
      const target =
        templates.find(
          (t) =>
            t.id === args.docTypeId ||
            t.name === args.docTypeId ||
            (args.situation && t.name.includes(args.situation))
        ) || templates[0];
      const { conditionLabel, steps } = resolveApprovalSteps(target, args.amount);
      return {
        success: true,
        mcpSource: source,
        template: {
          id: target.id,
          name: target.name,
          category: target.category,
          requiresAmount: target.requiresAmount,
          executionDept: target.executionDept,
          executionAssignee: target.executionAssignee,
          appliedRule: conditionLabel,
          approvalLine: steps.map((s) => `${s.order}. ${s.role} (${s.approverName})`),
          requiredFields: target.fields
            .filter((f) => f.required)
            .map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
          optionalFields: target.fields
            .filter((f) => !f.required)
            .map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
        },
        message: `'${target.name}' 양식의 필수/선택 입력 항목과 결재선을 조회했습니다.`,
      };
    }

    case "submit_approval": {
      const template = templates.find(
        (t) => t.id === args.docTypeId || t.name === args.docTypeId
      );
      if (!template) {
        return {
          success: false,
          error: `결재 문서 양식('${args.docTypeId || ""}')을 찾을 수 없습니다.`,
        };
      }
      if (!args.title || !args.title.trim()) {
        return {
          success: false,
          error: "결재 문서 제목(title)이 필요합니다.",
        };
      }
      const db = getDb();
      if (!db.approvalDocuments) db.approvalDocuments = [];
      const nowIso = new Date().toISOString();
      const { steps } = resolveApprovalSteps(template, args.amount);
      const countToday = db.approvalDocuments.length + 1;
      const docNumber = `APR-${nowIso.slice(0, 10).replace(/-/g, "")}-${String(countToday).padStart(3, "0")}`;

      const newDoc: ApprovalDocumentRecord = {
        id: generateId(),
        docNumber,
        docTypeId: template.id,
        docTypeName: template.name,
        category: template.category,
        title: args.title.trim(),
        requesterName: db.settings?.userName || db.settings?.authUserName || "기안자",
        requesterDept: args.requesterDept || "사업개발팀",
        amount: args.amount,
        formData: args.formData || {},
        steps,
        currentStepOrder: steps[0]?.order || 1,
        status: "in_progress",
        executionDept: template.executionDept,
        executionAssignee: template.executionAssignee,
        executionEmail: template.executionEmail,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.approvalDocuments.unshift(newDoc);
      saveDb(db);

      return {
        success: true,
        document: newDoc,
        message: `결재 문서 '${newDoc.title}' (${newDoc.docNumber})가 상신되었습니다. 첫 번째 결재자(${steps[0]?.approverName || "담당자"})에게 전달되었습니다.`,
      };
    }

    case "get_statistics": {
      const db = getDb();
      const docs = db.approvalDocuments || [];
      const stats = buildApprovalStats(docs);
      return {
        success: true,
        stats,
        recentDocuments: docs.slice(0, 5).map((d) => ({
          docNumber: d.docNumber,
          docTypeName: d.docTypeName,
          title: d.title,
          status: d.status,
          amount: d.amount,
          executionDept: d.executionDept,
          executionDeliveredAt: d.executionDeliveredAt,
        })),
        message: `총 ${stats.totalCount}건(진행 중 ${stats.inProgressCount}건, 완료 ${stats.approvedCount}건, 반려 ${stats.rejectedCount}건)의 결재 통계를 집계했습니다.`,
      };
    }

    default:
      return {
        success: false,
        error: `지원하지 않는 Approval Flow 작업입니다: ${args.action}`,
      };
  }
}
