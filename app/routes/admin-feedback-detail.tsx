import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClockIcon,
  CodeBlockIcon,
  DeviceMobileIcon,
  InfoIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { data, Form, Link, redirect } from "react-router";

import type { Route } from "./+types/admin-feedback-detail";
import { adminActorContext, requireCapability } from "../auth/admin";
import {
  FEEDBACK_ASSISTANCE_LABELS,
  FEEDBACK_REASON_LABELS,
  FEEDBACK_STATUS_LABELS,
} from "../domain/feedback-labels";
import { platformContext } from "../platform/context";
import {
  AdminFeedbackError,
  getAdminFeedback,
  reviewAdminFeedback,
  type AdminFeedbackReviewStatus,
} from "../services/admin-feedback.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_STATUSES = new Set<AdminFeedbackReviewStatus>([
  "pending",
  "accepted",
  "rejected",
]);
const LIST_PARAMETER_NAMES = ["q", "status", "rating", "page"] as const;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function listSearchParams(url: URL) {
  const params = new URLSearchParams();
  for (const name of LIST_PARAMETER_NAMES) {
    const value = url.searchParams.get(name);
    if (value) params.set(name, value);
  }
  return params;
}

function listHref(url: URL) {
  const query = listSearchParams(url).toString();
  return `/admin/feedback${query ? `?${query}` : ""}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "feedback:read");
  if (!params.feedbackId || !UUID_PATTERN.test(params.feedbackId)) {
    throw new Response("Feedback not found", { status: 404 });
  }
  const { db } = context.get(platformContext);
  const feedback = await getAdminFeedback(db, params.feedbackId);
  if (!feedback) throw new Response("Feedback not found", { status: 404 });
  const url = new URL(request.url);
  return {
    feedback,
    listHref: listHref(url),
    notice: url.searchParams.get("notice"),
  };
}

export async function action({ context, params, request }: Route.ActionArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "feedback:review");
  if (!params.feedbackId || !UUID_PATTERN.test(params.feedbackId)) {
    return data({ ok: false, message: "反馈记录不存在" }, { status: 404 });
  }
  const formData = await request.formData();
  const status = field(formData, "status") as AdminFeedbackReviewStatus;
  const note = field(formData, "note");
  const expectedUpdatedAt = field(formData, "expectedUpdatedAt");
  if (!REVIEW_STATUSES.has(status) || note.length > 2_000) {
    return data({ ok: false, message: "审核内容无效" }, { status: 400 });
  }

  try {
    const { db } = context.get(platformContext);
    await reviewAdminFeedback(db, actor, params.feedbackId, {
      status,
      note,
      expectedUpdatedAt,
    });
    const url = new URL(request.url);
    const redirectParams = listSearchParams(url);
    redirectParams.set("notice", "saved");
    return redirect(
      `/admin/feedback/${params.feedbackId}?${redirectParams.toString()}`,
    );
  } catch (error) {
    if (error instanceof AdminFeedbackError) {
      const statusCode =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "CONFLICT"
            ? 409
            : 400;
      return data(
        { ok: false, message: error.message },
        { status: statusCode },
      );
    }
    throw error;
  }
}

export default function AdminFeedbackDetail({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const { feedback } = loaderData;
  const environmentEntries = [
    ["访问来源", feedback.environment.entryReferrerKind],
    ["设备类型", feedback.environment.deviceCategory],
    ["视口分组", feedback.environment.viewportBucket],
    ["输入方式", feedback.environment.inputMode],
    ["配色", feedback.environment.colorScheme],
    [
      "减少动态效果",
      feedback.environment.reducedMotion === null
        ? null
        : feedback.environment.reducedMotion
          ? "是"
          : "否",
    ],
    ["浏览器语言", feedback.environment.clientLanguage],
    ["浏览器", feedback.environment.browserFamily],
    ["操作系统", feedback.environment.osFamily],
    ["国家或地区", feedback.environment.cfCountry],
    ["Cloudflare Colo", feedback.environment.cfColo],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <main className="admin-page admin-feedback-detail">
      <header className="admin-feedback-detail-header">
        <Link to={loaderData.listHref}>
          <ArrowLeftIcon aria-hidden="true" size={17} />
          返回反馈列表
        </Link>
        <div>
          <p className="admin-eyebrow">反馈详情</p>
          <h1>{feedback.snippet.title}</h1>
          <p>/{feedback.snippet.slug}</p>
        </div>
        <span className={`admin-review-status ${feedback.reviewStatus}`}>
          {FEEDBACK_STATUS_LABELS[feedback.reviewStatus]}
        </span>
      </header>

      {loaderData.notice === "saved" ? (
        <p className="admin-feedback success" role="status">
          <CheckCircleIcon aria-hidden="true" size={18} />
          审核结果已保存
        </p>
      ) : actionData ? (
        <p className="admin-feedback error" role="alert">
          <InfoIcon aria-hidden="true" size={18} />
          {actionData.message}
        </p>
      ) : null}

      <div className="admin-feedback-detail-grid">
        <div className="admin-feedback-detail-content">
          <section className="admin-panel admin-feedback-response-card">
            <header className="admin-panel-heading">
              <div>
                {feedback.helpful ? (
                  <ThumbsUpIcon aria-hidden="true" size={20} />
                ) : (
                  <ThumbsDownIcon aria-hidden="true" size={20} />
                )}
                <h2>{feedback.helpful ? "有帮助" : "没帮助"}</h2>
              </div>
              <time dateTime={feedback.createdAt}>
                {formatDate(feedback.createdAt)}
              </time>
            </header>
            <dl className="admin-feedback-facts">
              <div>
                <dt>原因</dt>
                <dd>
                  {feedback.reason
                    ? (FEEDBACK_REASON_LABELS[feedback.reason] ??
                      feedback.reason)
                    : "未补充"}
                </dd>
              </div>
              <div>
                <dt>后续协助</dt>
                <dd>{FEEDBACK_ASSISTANCE_LABELS[feedback.assistanceIntent]}</dd>
              </div>
              <div>
                <dt>请求语言</dt>
                <dd>{feedback.requestedLocale}</dd>
              </div>
              <div>
                <dt>内容语言</dt>
                <dd>{feedback.contentLocale}</dd>
              </div>
            </dl>
            {feedback.reasonDetail ? (
              <div className="admin-feedback-prose">
                <h3>补充说明</h3>
                <p>{feedback.reasonDetail}</p>
              </div>
            ) : null}
            {feedback.suggestion ? (
              <div className="admin-feedback-prose suggestion">
                <h3>改进建议</h3>
                <p>{feedback.suggestion}</p>
              </div>
            ) : null}
            {feedback.attribution ? (
              <div className="admin-feedback-attribution">
                <UserIcon aria-hidden="true" size={18} />
                <span>
                  <strong>{feedback.attribution}</strong>
                  <small>
                    {feedback.anonymousDisplay
                      ? "公开引用时保持匿名"
                      : "允许公开署名"}
                  </small>
                </span>
              </div>
            ) : null}
          </section>

          <section className="admin-panel">
            <header className="admin-panel-heading">
              <div>
                <CodeBlockIcon aria-hidden="true" size={20} weight="duotone" />
                <h2>内容版本</h2>
              </div>
              <Link to={`/admin/snippets/${feedback.snippet.id}`}>
                打开编辑器 <ArrowSquareOutIcon aria-hidden="true" size={15} />
              </Link>
            </header>
            <dl className="admin-feedback-version-grid">
              <div>
                <dt>Snippet Revision</dt>
                <dd>v{feedback.revision.number}</dd>
                <small>{feedback.revision.id}</small>
              </div>
              <div>
                <dt>Localization Revision</dt>
                <dd>v{feedback.localizationRevision.number}</dd>
                <small>{feedback.localizationRevision.id}</small>
              </div>
              <div>
                <dt>公开页面</dt>
                <dd>
                  <a href={feedback.pagePath} target="_blank" rel="noreferrer">
                    {feedback.pagePath}
                    <ArrowSquareOutIcon aria-hidden="true" size={14} />
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <details className="admin-panel admin-feedback-environment">
            <summary>
              <DeviceMobileIcon aria-hidden="true" size={19} />
              环境信息
              <span>{environmentEntries.length} 项</span>
            </summary>
            {environmentEntries.length ? (
              <dl>
                {environmentEntries.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>没有收集到环境信息。</p>
            )}
          </details>
        </div>

        <aside className="admin-panel admin-feedback-review-card">
          <header className="admin-panel-heading">
            <div>
              <ClockIcon aria-hidden="true" size={20} weight="duotone" />
              <h2>审核处理</h2>
            </div>
          </header>
          <Form method="post">
            <input
              name="expectedUpdatedAt"
              type="hidden"
              value={feedback.updatedAt}
            />
            <label className="admin-form-field">
              <span>处理结论</span>
              <select defaultValue={feedback.reviewStatus} name="status">
                <option value="pending">待处理</option>
                <option value="accepted">已采纳</option>
                <option value="rejected">已拒绝</option>
              </select>
            </label>
            <label className="admin-form-field">
              <span>审核备注</span>
              <textarea
                defaultValue={feedback.reviewNote ?? ""}
                maxLength={2000}
                name="note"
                placeholder="记录采纳方式、拒绝原因或后续事项"
                rows={7}
              />
              <small>仅管理端可见，最多 2,000 字。</small>
            </label>
            <button className="admin-primary-button" type="submit">
              保存审核结果
            </button>
          </Form>
          <dl className="admin-feedback-review-meta">
            <div>
              <dt>最后审核人</dt>
              <dd>{feedback.reviewedBy ?? "尚未审核"}</dd>
            </div>
            <div>
              <dt>最后审核时间</dt>
              <dd>{formatDate(feedback.reviewedAt)}</dd>
            </div>
            <div>
              <dt>记录更新时间</dt>
              <dd>{formatDate(feedback.updatedAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
