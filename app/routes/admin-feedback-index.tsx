import {
  CaretLeftIcon,
  CaretRightIcon,
  ChatCenteredTextIcon,
  MagnifyingGlassIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@phosphor-icons/react";
import { Form, Link } from "react-router";

import type { Route } from "./+types/admin-feedback-index";
import { adminActorContext, requireCapability } from "../auth/admin";
import {
  FEEDBACK_REASON_LABELS,
  FEEDBACK_STATUS_LABELS,
} from "../domain/feedback-labels";
import { platformContext } from "../platform/context";
import {
  listAdminFeedback,
  type AdminFeedbackListFilters,
} from "../services/admin-feedback.server";

const STATUS_FILTERS = [
  ["pending", "待处理"],
  ["all", "全部"],
  ["accepted", "已采纳"],
  ["rejected", "已拒绝"],
] as const;

const RATING_FILTERS = [
  ["all", "全部评价"],
  ["helpful", "有帮助"],
  ["not-helpful", "没帮助"],
] as const;

function parseFilters(request: Request): AdminFeedbackListFilters {
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status") ?? "pending";
  const status = STATUS_FILTERS.some(([value]) => value === rawStatus)
    ? (rawStatus as AdminFeedbackListFilters["status"])
    : "pending";
  const rawRating = url.searchParams.get("rating") ?? "all";
  const rating = RATING_FILTERS.some(([value]) => value === rawRating)
    ? (rawRating as AdminFeedbackListFilters["rating"])
    : "all";
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return {
    query: (url.searchParams.get("q") ?? "").trim().slice(0, 200),
    status,
    rating,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

function filterSearchParams(filters: AdminFeedbackListFilters, page?: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status !== "pending") params.set("status", filters.status);
  if (filters.rating !== "all") params.set("rating", filters.rating);
  if (page && page > 1) params.set("page", String(page));
  return params;
}

function detailHref(id: string, filters: AdminFeedbackListFilters) {
  const query = filterSearchParams(filters, filters.page).toString();
  return `/admin/feedback/${id}${query ? `?${query}` : ""}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "feedback:read");
  const filters = parseFilters(request);
  const { db } = context.get(platformContext);
  const result = await listAdminFeedback(db, filters);
  return {
    ...result,
    filters: { ...filters, page: result.pagination.page },
  };
}

export default function AdminFeedbackIndex({
  loaderData,
}: Route.ComponentProps) {
  const { filters, items, pagination } = loaderData;
  return (
    <main className="admin-page admin-feedback-index">
      <header className="admin-page-header">
        <p className="admin-eyebrow">读者反馈</p>
        <h1>Snippet Feedback</h1>
        <p>查看读者评价、改进建议与审核状态。</p>
      </header>

      <Form className="admin-feedback-filter" method="get">
        <label className="admin-search-field">
          <MagnifyingGlassIcon aria-hidden="true" size={18} />
          <span className="visually-hidden">搜索反馈</span>
          <input
            defaultValue={filters.query}
            maxLength={200}
            name="q"
            placeholder="搜索标题、slug、建议或署名"
            type="search"
          />
        </label>
        <label className="admin-feedback-rating-filter">
          <span>评价</span>
          <select defaultValue={filters.rating} name="rating">
            {RATING_FILTERS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="admin-secondary-button" type="submit">
          筛选
        </button>
        <div
          className="admin-filter-tabs admin-feedback-status-tabs"
          role="group"
          aria-label="审核状态"
        >
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              className={filters.status === value ? "active" : ""}
              key={value}
              name="status"
              type="submit"
              value={value}
            >
              {label}
            </button>
          ))}
        </div>
      </Form>

      <section className="admin-panel admin-feedback-list-panel">
        <header className="admin-panel-heading">
          <div>
            <ChatCenteredTextIcon
              aria-hidden="true"
              size={21}
              weight="duotone"
            />
            <h2>反馈记录</h2>
          </div>
          <span>{pagination.total} 条</span>
        </header>
        {items.length ? (
          <div className="admin-feedback-list">
            {items.map((item) => (
              <Link
                className="admin-feedback-list-item"
                key={item.id}
                to={detailHref(item.id, filters)}
              >
                <span
                  className={`admin-feedback-rating ${
                    item.helpful ? "helpful" : "not-helpful"
                  }`}
                >
                  {item.helpful ? (
                    <ThumbsUpIcon aria-hidden="true" size={18} />
                  ) : (
                    <ThumbsDownIcon aria-hidden="true" size={18} />
                  )}
                  <span>{item.helpful ? "有帮助" : "没帮助"}</span>
                </span>
                <span className="admin-feedback-list-copy">
                  <strong>{item.snippetTitle}</strong>
                  <small>/{item.slug}</small>
                  <span>
                    {item.reason
                      ? (FEEDBACK_REASON_LABELS[item.reason] ?? item.reason)
                      : "未补充原因"}
                    {item.excerpt ? ` · ${item.excerpt}` : ""}
                  </span>
                </span>
                <span className="admin-feedback-locales">
                  {item.requestedLocale === item.contentLocale
                    ? item.contentLocale
                    : `${item.requestedLocale} → ${item.contentLocale}`}
                </span>
                <span className={`admin-review-status ${item.reviewStatus}`}>
                  {FEEDBACK_STATUS_LABELS[item.reviewStatus]}
                </span>
                <time dateTime={item.createdAt}>
                  {formatDate(item.createdAt)}
                </time>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-empty-state">
            <ChatCenteredTextIcon
              aria-hidden="true"
              size={38}
              weight="duotone"
            />
            <h2>没有匹配的反馈</h2>
            <p>调整筛选条件，或等待新的读者反馈。</p>
          </div>
        )}
        {pagination.total > pagination.pageSize ? (
          <nav className="admin-pagination" aria-label="反馈分页">
            {pagination.page > 1 ? (
              <Link
                to={`?${filterSearchParams(
                  filters,
                  pagination.page - 1,
                ).toString()}`}
              >
                <CaretLeftIcon aria-hidden="true" size={16} />
                上一页
              </Link>
            ) : (
              <span aria-disabled="true">
                <CaretLeftIcon aria-hidden="true" size={16} />
                上一页
              </span>
            )}
            <strong>
              {pagination.page} / {pagination.pageCount}
            </strong>
            {pagination.page < pagination.pageCount ? (
              <Link
                to={`?${filterSearchParams(
                  filters,
                  pagination.page + 1,
                ).toString()}`}
              >
                下一页
                <CaretRightIcon aria-hidden="true" size={16} />
              </Link>
            ) : (
              <span aria-disabled="true">
                下一页
                <CaretRightIcon aria-hidden="true" size={16} />
              </span>
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
