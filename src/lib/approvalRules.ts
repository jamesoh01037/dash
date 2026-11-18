import type { ApprovalTemplate, ApprovalStepRecord } from "@/lib/db";

export function resolveApprovalSteps(
  template: ApprovalTemplate,
  amount?: number
): { conditionLabel: string; steps: ApprovalStepRecord[] } {
  const numericAmount = typeof amount === "number" && !Number.isNaN(amount) ? amount : 0;
  const matchedRule =
    template.amountRules.find(
      (r) =>
        numericAmount >= r.minAmount &&
        (r.maxAmount === null || numericAmount <= r.maxAmount)
    ) || template.amountRules[template.amountRules.length - 1];

  const steps: ApprovalStepRecord[] = (matchedRule?.steps || []).map((s, idx) => ({
    order: idx + 1,
    role: s.role,
    approverName: s.approverName,
    approverEmail: s.approverEmail,
    status: idx === 0 ? "pending" : "waiting",
  }));

  return {
    conditionLabel: matchedRule?.conditionLabel || "기본 결재선",
    steps,
  };
}
