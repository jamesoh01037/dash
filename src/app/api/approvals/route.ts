import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb, ApprovalDocumentRecord, ApprovalTemplate } from "@/lib/db";
import {
  DEFAULT_APPROVAL_TEMPLATES,
  fetchApprovalTemplatesFromMcp,
  resolveApprovalSteps,
  buildApprovalStats,
} from "@/lib/approvalMcp";
import { generateId } from "@/lib/utils";

export async function GET() {
  try {
    const db = getDb();
    const docs = [...(db.approvalDocuments || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const { templates, source } = await fetchApprovalTemplatesFromMcp();
    const stats = buildApprovalStats(docs);

    return NextResponse.json({
      templates,
      mcpSource: source,
      documents: docs,
      stats,
    });
  } catch (err) {
    console.error("GET /api/approvals error:", err);
    return NextResponse.json(
      { error: "결재 정보를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      id,
      docTypeId,
      title,
      requesterDept,
      amount,
      formData,
      comment,
      template: updatedTemplate,
    } = body;

    const db = getDb();
    if (!db.approvalDocuments) db.approvalDocuments = [];
    const nowIso = new Date().toISOString();

    if (action === "create") {
      const { templates } = await fetchApprovalTemplatesFromMcp();
      const template = templates.find((t) => t.id === docTypeId);
      if (!template) {
        return NextResponse.json(
          { error: "선택한 결재 문서 양식을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      const cleanTitle = String(title || "").trim();
      if (!cleanTitle) {
        return NextResponse.json(
          { error: "결재 문서 제목을 입력해 주세요." },
          { status: 400 }
        );
      }

      const parsedAmount =
        amount !== undefined && amount !== null && String(amount).trim() !== ""
          ? Number(String(amount).replace(/,/g, ""))
          : undefined;

      const { steps } = resolveApprovalSteps(template, parsedAmount);
      const countToday = db.approvalDocuments.length + 1;
      const dateCode = nowIso.slice(0, 10).replace(/-/g, "");
      const docNumber = `APR-${dateCode}-${String(countToday).padStart(3, "0")}`;

      const newDoc: ApprovalDocumentRecord = {
        id: generateId(),
        docNumber,
        docTypeId: template.id,
        docTypeName: template.name,
        category: template.category,
        title: cleanTitle,
        requesterName: db.settings?.userName || db.settings?.authUserName || "기안자",
        requesterDept: String(requesterDept || "사업개발팀").trim() || "사업개발팀",
        amount:
          typeof parsedAmount === "number" && !Number.isNaN(parsedAmount)
            ? parsedAmount
            : undefined,
        formData: (formData && typeof formData === "object" ? formData : {}) as Record<
          string,
          string
        >,
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

      return NextResponse.json({
        success: true,
        document: newDoc,
        stats: buildApprovalStats(db.approvalDocuments),
      });
    }

    if (action === "approve" || action === "reject") {
      if (!id) {
        return NextResponse.json({ error: "결재 문서 ID가 필요합니다." }, { status: 400 });
      }
      const doc = db.approvalDocuments.find((d) => d.id === id);
      if (!doc) {
        return NextResponse.json({ error: "결재 문서를 찾을 수 없습니다." }, { status: 404 });
      }
      if (doc.status !== "in_progress") {
        return NextResponse.json(
          { error: "이미 종결된 결재 문서입니다." },
          { status: 400 }
        );
      }

      const stepIdx = doc.steps.findIndex((s) => s.order === doc.currentStepOrder);
      if (stepIdx === -1) {
        return NextResponse.json(
          { error: "현재 결재 단계를 찾을 수 없습니다." },
          { status: 400 }
        );
      }

      doc.steps[stepIdx].status = action === "approve" ? "approved" : "rejected";
      doc.steps[stepIdx].actedAt = nowIso;
      if (typeof comment === "string" && comment.trim()) {
        doc.steps[stepIdx].comment = comment.trim();
      }

      if (action === "reject") {
        doc.status = "rejected";
      } else {
        const nextStep = doc.steps[stepIdx + 1];
        if (nextStep) {
          nextStep.status = "pending";
          doc.currentStepOrder = nextStep.order;
        } else {
          doc.status = "approved";
          doc.executionDeliveredAt = nowIso;
        }
      }

      doc.updatedAt = nowIso;
      saveDb(db);

      return NextResponse.json({
        success: true,
        document: doc,
        stats: buildApprovalStats(db.approvalDocuments),
      });
    }

    if (action === "update_template") {
      const tpl = updatedTemplate as ApprovalTemplate | undefined;
      if (!tpl || !tpl.id || !tpl.name?.trim()) {
        return NextResponse.json(
          { error: "수정할 결재 규정 정보가 올바르지 않습니다." },
          { status: 400 }
        );
      }
      const baseTemplates =
        Array.isArray(db.approvalTemplates) && db.approvalTemplates.length > 0
          ? db.approvalTemplates
          : DEFAULT_APPROVAL_TEMPLATES.map((t) => ({ ...t }));
      const exists = baseTemplates.some((t) => t.id === tpl.id);
      db.approvalTemplates = exists
        ? baseTemplates.map((t) => (t.id === tpl.id ? tpl : t))
        : [...baseTemplates, tpl];
      saveDb(db);
      return NextResponse.json({
        success: true,
        templates: db.approvalTemplates,
      });
    }

    if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "결재 문서 ID가 필요합니다." }, { status: 400 });
      }
      db.approvalDocuments = db.approvalDocuments.filter((d) => d.id !== id);
      saveDb(db);
      return NextResponse.json({
        success: true,
        stats: buildApprovalStats(db.approvalDocuments),
      });
    }

    return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/approvals error:", err);
    return NextResponse.json(
      { error: "결재 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
