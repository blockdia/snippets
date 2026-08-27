import {
  ArchiveBoxIcon,
  CheckCircleIcon,
  FileDashedIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TranslateIcon,
} from "@phosphor-icons/react";
import { Form, Link } from "react-router";

import type { Route } from "./+types/admin-snippets-index";
import { adminActorContext, requireCapability } from "../auth/admin";
import { platformContext } from "../platform/context";
import { listAdminSnippets } from "../services/admin.server";

const FILTERS = [
  ["all", "全部"],
  ["draft", "有草稿"],
  ["active", "有效"],
  ["archived", "已归档"],
] as const;

export async function loader({ context, request }: Route.LoaderArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "snippets:read");
  const { db } = context.get(platformContext);
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const rawStatus = url.searchParams.get("status") ?? "all";
  const status = FILTERS.some(([value]) => value === rawStatus)
    ? (rawStatus as (typeof FILTERS)[number][0])
    : "all";
  return {
    items: await listAdminSnippets(db, { query, status }),
    query,
    status,
  };
}

export default function AdminSnippetsIndex({
  loaderData,
}: Route.ComponentProps) {
  return (
    <main className="admin-page">
      <header className="admin-page-header admin-page-header-row">
        <div>
          <p className="admin-eyebrow">内容</p>
          <h1>Snippets</h1>
          <p>管理代码版本、三语内容和发布状态。</p>
        </div>
        <Link className="admin-primary-button" to="/admin/snippets/new">
          <PlusIcon aria-hidden="true" size={17} weight="bold" />
          新建 Snippet
        </Link>
      </header>
      <Form className="admin-filter-bar" method="get">
        <label className="admin-search-field">
          <MagnifyingGlassIcon aria-hidden="true" size={18} />
          <span className="visually-hidden">搜索内容</span>
          <input
            defaultValue={loaderData.query}
            name="q"
            placeholder="搜索标题或 slug"
          />
        </label>
        <div className="admin-filter-tabs" role="group" aria-label="内容状态">
          {FILTERS.map(([value, label]) => (
            <button
              className={loaderData.status === value ? "active" : ""}
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
      <section className="admin-panel admin-table-panel">
        {loaderData.items.length ? (
          <div className="admin-table-scroll">
            <table className="admin-content-table">
              <thead>
                <tr>
                  <th>内容</th>
                  <th>状态</th>
                  <th>语言</th>
                  <th>最近更新</th>
                  <th>
                    <span className="visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loaderData.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link
                        className="admin-table-title"
                        to={`/admin/snippets/${item.id}`}
                      >
                        <span
                          className="admin-content-avatar"
                          aria-hidden="true"
                        >
                          {item.title.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>/{item.slug}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className={`admin-status-pill ${item.status}`}>
                        {item.status === "archived" ? (
                          <ArchiveBoxIcon aria-hidden="true" size={14} />
                        ) : item.draftRevisionId ? (
                          <FileDashedIcon aria-hidden="true" size={14} />
                        ) : (
                          <CheckCircleIcon aria-hidden="true" size={14} />
                        )}
                        {item.status === "archived"
                          ? "已归档"
                          : item.draftRevisionNumber
                            ? `草稿 v${item.draftRevisionNumber}`
                            : item.publishedRevisionNumber
                              ? `已发布 v${item.publishedRevisionNumber}`
                              : "未发布"}
                      </span>
                    </td>
                    <td>
                      <span className="admin-language-count">
                        <TranslateIcon aria-hidden="true" size={15} />
                        {item.compatibleLocales}/3
                      </span>
                    </td>
                    <td>
                      <time dateTime={item.updatedAt}>
                        {new Date(item.updatedAt).toLocaleDateString("zh-CN")}
                      </time>
                    </td>
                    <td>
                      <Link
                        className="admin-row-action"
                        to={`/admin/snippets/${item.id}`}
                      >
                        编辑
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <FileDashedIcon aria-hidden="true" size={38} weight="duotone" />
            <h2>没有匹配的内容</h2>
            <p>调整筛选条件，或创建一个新的 Snippet。</p>
          </div>
        )}
      </section>
    </main>
  );
}
