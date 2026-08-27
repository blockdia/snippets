import { PlusIcon, TagIcon, TrashIcon } from "@phosphor-icons/react";
import { data, Form } from "react-router";

import type { Route } from "./+types/admin-tags";
import { adminActorContext, requireCapability } from "../auth/admin";
import { SUPPORTED_LOCALES, type Locale } from "../i18n/locales";
import { platformContext } from "../platform/context";
import {
  AdminContentError,
  deleteAdminTag,
  listAdminTags,
  saveAdminTag,
  type AdminTagRecord,
} from "../services/admin.server";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export async function loader({ context }: Route.LoaderArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "tags:manage");
  const { db } = context.get(platformContext);
  return { tags: await listAdminTags(db) };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function localizationsFromForm(
  formData: FormData,
): AdminTagRecord["localizations"] {
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      {
        name: field(formData, `${locale}.name`),
        description: field(formData, `${locale}.description`),
      },
    ]),
  ) as AdminTagRecord["localizations"];
}

export async function action({ context, request }: Route.ActionArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "tags:manage");
  const { db } = context.get(platformContext);
  const formData = await request.formData();
  const intent = field(formData, "intent");
  try {
    if (intent === "delete") {
      await deleteAdminTag(db, field(formData, "id"));
      return { ok: true, message: "标签已删除" };
    }
    if (intent !== "save") {
      return data({ ok: false, message: "未知操作" }, { status: 400 });
    }
    await saveAdminTag(db, {
      ...(field(formData, "id") ? { id: field(formData, "id") } : {}),
      slug: field(formData, "slug"),
      localizations: localizationsFromForm(formData),
    });
    return { ok: true, message: "标签已保存" };
  } catch (error) {
    if (error instanceof AdminContentError) {
      return data({ ok: false, message: error.message }, { status: 400 });
    }
    throw error;
  }
}

function TagForm({ tag }: { tag?: AdminTagRecord }) {
  return (
    <Form className="admin-tag-form" method="post">
      <input name="id" type="hidden" value={tag?.id ?? ""} />
      <div className="admin-form-field admin-tag-slug">
        <label htmlFor={`tag-slug-${tag?.id ?? "new"}`}>Slug</label>
        <input
          defaultValue={tag?.slug ?? ""}
          id={`tag-slug-${tag?.id ?? "new"}`}
          name="slug"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="drawing"
          required
        />
      </div>
      <div className="admin-tag-localizations">
        {SUPPORTED_LOCALES.map((locale) => (
          <fieldset key={locale}>
            <legend>{LOCALE_LABELS[locale]}</legend>
            <label>
              <span>名称</span>
              <input
                defaultValue={tag?.localizations[locale].name ?? ""}
                name={`${locale}.name`}
                required
              />
            </label>
            <label>
              <span>描述</span>
              <input
                defaultValue={tag?.localizations[locale].description ?? ""}
                name={`${locale}.description`}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <div className="admin-tag-actions">
        {tag ? (
          <span>{tag.usageCount} 个版本引用</span>
        ) : (
          <span>创建新标签</span>
        )}
        <button
          className="admin-secondary-button"
          name="intent"
          type="submit"
          value="save"
        >
          保存
        </button>
        {tag && tag.usageCount === 0 ? (
          <button
            className="admin-danger-button"
            name="intent"
            type="submit"
            value="delete"
          >
            <TrashIcon aria-hidden="true" size={16} />
            删除
          </button>
        ) : null}
      </div>
    </Form>
  );
}

export default function AdminTags({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <p className="admin-eyebrow">分类</p>
        <h1>标签</h1>
        <p>标签名称可独立本地化，slug 用作稳定筛选标识。</p>
      </header>
      {actionData ? (
        <p
          className={`admin-feedback ${actionData.ok ? "success" : "error"}`}
          role="status"
        >
          {actionData.message}
        </p>
      ) : null}
      <section className="admin-panel admin-tags-panel">
        <header className="admin-panel-heading">
          <div>
            <TagIcon aria-hidden="true" size={21} weight="duotone" />
            <h2>现有标签</h2>
          </div>
          <span>{loaderData.tags.length} 个</span>
        </header>
        <div className="admin-tag-list">
          {loaderData.tags.map((tag) => (
            <TagForm key={tag.id} tag={tag} />
          ))}
        </div>
      </section>
      <section className="admin-panel admin-new-tag-panel">
        <header className="admin-panel-heading">
          <div>
            <PlusIcon aria-hidden="true" size={20} weight="bold" />
            <h2>新建标签</h2>
          </div>
        </header>
        <TagForm />
      </section>
    </main>
  );
}
