import {
  ArrowSquareOutIcon,
  CodeBlockIcon,
  HouseIcon,
  TagIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { isRouteErrorResponse, Link, NavLink, Outlet } from "react-router";

import type { Route } from "./+types/admin-layout";
import { adminActorContext, can } from "../auth/admin";
import {
  AdminAuthenticationError,
  adminResponseHeaders,
  authenticateAdminRequest,
  requireSameOriginMutation,
} from "../auth/admin.server";
import { platformContext } from "../platform/context";

export const headers = adminResponseHeaders;

export const middleware: Route.MiddlewareFunction[] = [
  async ({ context, request }, next) => {
    const { env } = context.get(platformContext);
    try {
      const actor = await authenticateAdminRequest(request, env, {
        allowLocalDevelopment: import.meta.env.DEV,
      });
      requireSameOriginMutation(request);
      context.set(adminActorContext, actor);
    } catch (error) {
      if (error instanceof AdminAuthenticationError) {
        throw new Response("管理端身份验证失败", { status: 403 });
      }
      throw error;
    }
    const response = await next();
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(adminResponseHeaders())) {
      headers.set(name, value);
    }
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  },
];

export function loader({ context }: Route.LoaderArgs) {
  return { actor: context.get(adminActorContext) };
}

const navigation = [
  {
    to: "/admin",
    label: "概览",
    icon: HouseIcon,
    capability: "dashboard:read",
  },
  {
    to: "/admin/snippets",
    label: "Snippets",
    icon: CodeBlockIcon,
    capability: "snippets:read",
  },
  {
    to: "/admin/tags",
    label: "标签",
    icon: TagIcon,
    capability: "tags:manage",
  },
] as const;

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/admin">
          <span className="admin-brand-mark" aria-hidden="true">
            S
          </span>
          <span>
            <strong>Snippets</strong>
            <small>内容工作台</small>
          </span>
        </Link>
        <nav aria-label="管理端导航" className="admin-navigation">
          {navigation.map((item) =>
            can(loaderData.actor, item.capability) ? (
              <NavLink end={item.to === "/admin"} key={item.to} to={item.to}>
                <item.icon aria-hidden="true" size={19} weight="duotone" />
                {item.label}
              </NavLink>
            ) : null,
          )}
        </nav>
        <div className="admin-sidebar-footer">
          <a href="/zh-cn" target="_blank" rel="noreferrer">
            <ArrowSquareOutIcon aria-hidden="true" size={18} />
            查看公开站点
          </a>
          <div className="admin-actor">
            <UserCircleIcon aria-hidden="true" size={30} weight="duotone" />
            <span>
              <strong>{loaderData.actor.displayName}</strong>
              <small>{loaderData.actor.email}</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="admin-main-column">
        <header className="admin-mobile-header">
          <Link className="admin-mobile-brand" to="/admin">
            Snippets 工作台
          </Link>
          <nav aria-label="管理端快捷导航">
            {navigation.map((item) =>
              can(loaderData.actor, item.capability) ? (
                <NavLink end={item.to === "/admin"} key={item.to} to={item.to}>
                  <item.icon aria-hidden="true" size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ) : null,
            )}
          </nav>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return (
    <main className="admin-standalone-error">
      <span>{status}</span>
      <h1>{status === 403 ? "无法进入管理端" : "管理端暂时不可用"}</h1>
      <p>
        {status === 403
          ? "请确认 Cloudflare Access 已放行当前身份，且 Worker 的 Access 配置正确。"
          : "请求没有完成，请稍后再试。"}
      </p>
      <Link to="/zh-cn">返回公开站点</Link>
    </main>
  );
}
