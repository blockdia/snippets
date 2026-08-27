import {
  ArchiveBoxIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  FileDashedIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router";

import type { Route } from "./+types/admin-dashboard";
import { adminActorContext, requireCapability } from "../auth/admin";
import { platformContext } from "../platform/context";
import { getAdminDashboard } from "../services/admin.server";

export async function loader({ context }: Route.LoaderArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "dashboard:read");
  const { db } = context.get(platformContext);
  return { dashboard: await getAdminDashboard(db) };
}

const metrics = [
  { key: "published", label: "已发布", icon: CheckCircleIcon, tone: "green" },
  { key: "drafts", label: "有草稿", icon: FileDashedIcon, tone: "purple" },
  {
    key: "needsTranslation",
    label: "待补翻译",
    icon: TranslateIcon,
    tone: "amber",
  },
  { key: "archived", label: "已归档", icon: ArchiveBoxIcon, tone: "slate" },
] as const;

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { dashboard } = loaderData;
  return (
    <main className="admin-page">
      <header className="admin-page-header admin-page-header-row">
        <div>
          <p className="admin-eyebrow">内容工作台</p>
          <h1>今天要维护什么？</h1>
          <p>快速查看草稿、翻译状态与最近修改。</p>
        </div>
        <Link className="admin-primary-button" to="/admin/snippets/new">
          新建 Snippet
        </Link>
      </header>

      <section aria-label="内容概况" className="admin-metric-grid">
        {metrics.map((metric) => (
          <article
            className={`admin-metric-card ${metric.tone}`}
            key={metric.key}
          >
            <span className="admin-metric-icon">
              <metric.icon aria-hidden="true" size={23} weight="duotone" />
            </span>
            <div>
              <strong>{dashboard.counts[metric.key]}</strong>
              <span>{metric.label}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-panel">
        <header className="admin-panel-heading">
          <div>
            <ClockCounterClockwiseIcon
              aria-hidden="true"
              size={21}
              weight="duotone"
            />
            <h2>最近修改</h2>
          </div>
          <Link to="/admin/snippets">
            查看全部 <ArrowRightIcon aria-hidden="true" size={15} />
          </Link>
        </header>
        {dashboard.recent.length ? (
          <div className="admin-recent-list">
            {dashboard.recent.map((item) => (
              <Link key={item.id} to={`/admin/snippets/${item.id}`}>
                <span className="admin-content-avatar" aria-hidden="true">
                  {item.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="admin-recent-copy">
                  <strong>{item.title}</strong>
                  <small>/{item.slug}</small>
                </span>
                <span className="admin-recent-status">
                  {item.draftRevisionNumber
                    ? `草稿 v${item.draftRevisionNumber}`
                    : item.publishedRevisionNumber
                      ? `已发布 v${item.publishedRevisionNumber}`
                      : "未发布"}
                </span>
                <span className="admin-recent-locales">
                  {item.compatibleLocales}/3 语言
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-empty-state">
            <FileDashedIcon aria-hidden="true" size={36} weight="duotone" />
            <h3>还没有内容</h3>
            <p>从第一个可复用 Scratch 片段开始。</p>
          </div>
        )}
      </section>
    </main>
  );
}
