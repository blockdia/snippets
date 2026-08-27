export const FEEDBACK_REASON_LABELS: Record<string, string> = {
  clear: "说明清楚",
  solved: "解决了问题",
  reusable: "容易复用",
  confusing: "说明难以理解",
  "code-issue": "代码存在问题",
  "translation-issue": "翻译存在问题",
  "missing-context": "缺少必要背景",
  other: "其他",
};

export const FEEDBACK_STATUS_LABELS = {
  pending: "待处理",
  accepted: "已采纳",
  rejected: "已拒绝",
} as const;

export const FEEDBACK_ASSISTANCE_LABELS = {
  "not-asked": "未询问协助",
  accepted: "愿意协助改进",
  declined: "不参与后续协助",
} as const;
