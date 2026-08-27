import { data, redirect } from "react-router";

import type { Route } from "./+types/admin-snippet-editor";
import { adminActorContext, requireCapability } from "../auth/admin";
import { AdminSnippetStudio } from "../components/admin-snippet-studio";
import { canonicalizeLocale, SUPPORTED_LOCALES } from "../i18n/locales";
import { platformContext } from "../platform/context";
import {
  AdminContentError,
  deleteUnpublishedAdminSnippet,
  getAdminSnippet,
  listAdminTags,
  publishAdminLocalizationDraft,
  publishAdminSnippetDraft,
  removeAdminDemoArtifact,
  saveAdminSnippetDraft,
  setAdminSnippetArchived,
  storeAdminDemoArtifact,
  type AdminContributorInput,
  type AdminLocalizationInput,
  type AdminReferenceInput,
  type AdminScriptInput,
  type AdminSnippetDraftInput,
  type AdminUnitInput,
} from "../services/admin.server";

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const actor = context.get(adminActorContext);
  requireCapability(actor, "snippets:read");
  const { db } = context.get(platformContext);
  const editor = params.snippetId
    ? await getAdminSnippet(db, params.snippetId)
    : null;
  if (params.snippetId && !editor) {
    throw new Response("Snippet not found", { status: 404 });
  }
  const url = new URL(request.url);
  return {
    editor,
    tags: await listAdminTags(db),
    notice: url.searchParams.get("notice"),
  };
}

function stringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringProperty(value: Record<string, unknown>, key: string): string {
  return typeof value[key] === "string" ? value[key] : "";
}

function booleanProperty(value: Record<string, unknown>, key: string): boolean {
  return value[key] === true;
}

function jsonArray(
  formData: FormData,
  name: string,
): Record<string, unknown>[] {
  const source = stringField(formData, name);
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) throw null;
    return parsed
      .map(record)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  } catch {
    throw new AdminContentError("INVALID_INPUT", `${name} 数据格式无效`);
  }
}

function parseDraftInput(formData: FormData): AdminSnippetDraftInput {
  const scripts: AdminScriptInput[] = jsonArray(formData, "scripts").map(
    (entry) => ({
      key: stringProperty(entry, "key"),
      title: stringProperty(entry, "title"),
      source: stringProperty(entry, "source"),
    }),
  );
  const units: AdminUnitInput[] = jsonArray(formData, "units").map((entry) => ({
    key: stringProperty(entry, "key"),
    kind: stringProperty(entry, "kind") as AdminUnitInput["kind"],
    sourceText: stringProperty(entry, "sourceText"),
  }));
  const references: AdminReferenceInput[] = jsonArray(
    formData,
    "references",
  ).map((entry) => ({
    key: stringProperty(entry, "key"),
    kind: stringProperty(entry, "kind") as AdminReferenceInput["kind"],
    url: stringProperty(entry, "url"),
    title: stringProperty(entry, "title"),
  }));
  const contributors: AdminContributorInput[] = jsonArray(
    formData,
    "contributors",
  ).map((entry) => ({
    ...(stringProperty(entry, "id") ? { id: stringProperty(entry, "id") } : {}),
    kind: stringProperty(entry, "kind") as AdminContributorInput["kind"],
    displayName: stringProperty(entry, "displayName"),
    ...(stringProperty(entry, "externalId")
      ? { externalId: stringProperty(entry, "externalId") }
      : {}),
    ...(stringProperty(entry, "profileUrl")
      ? { profileUrl: stringProperty(entry, "profileUrl") }
      : {}),
    role: stringProperty(entry, "role") as AdminContributorInput["role"],
  }));
  const localizations: AdminLocalizationInput[] = jsonArray(
    formData,
    "localizations",
  ).map((entry) => {
    const locale = canonicalizeLocale(stringProperty(entry, "locale"));
    if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
      throw new AdminContentError("INVALID_INPUT", "语言标识无效");
    }
    const keywords = entry["keywords"];
    const scriptOverrides = entry["scriptOverrides"];
    const unitsValue = entry["units"];
    return {
      locale,
      title: stringProperty(entry, "title"),
      summary: stringProperty(entry, "summary"),
      seoTitle: stringProperty(entry, "seoTitle"),
      seoDescription: stringProperty(entry, "seoDescription"),
      bodyMarkdown: stringProperty(entry, "bodyMarkdown"),
      keywords: Array.isArray(keywords)
        ? keywords.filter((value): value is string => typeof value === "string")
        : [],
      proseLicense: stringProperty(entry, "proseLicense"),
      basisAccepted: booleanProperty(entry, "basisAccepted"),
      scriptOverrides: Array.isArray(scriptOverrides)
        ? scriptOverrides
            .map(record)
            .filter((value): value is Record<string, unknown> => Boolean(value))
            .map((value) => ({
              key: stringProperty(value, "key"),
              source: stringProperty(value, "source"),
            }))
        : [],
      units: Array.isArray(unitsValue)
        ? unitsValue
            .map(record)
            .filter((value): value is Record<string, unknown> => Boolean(value))
            .map((value) => ({
              key: stringProperty(value, "key"),
              translatedText: stringProperty(value, "translatedText"),
            }))
        : [],
    };
  });
  let tagIds: string[] = [];
  try {
    const parsed = JSON.parse(stringField(formData, "tagIds")) as unknown;
    if (Array.isArray(parsed)) {
      tagIds = parsed.filter(
        (value): value is string => typeof value === "string",
      );
    }
  } catch {
    throw new AdminContentError("INVALID_INPUT", "标签数据格式无效");
  }
  return {
    ...(stringField(formData, "snippetId")
      ? { snippetId: stringField(formData, "snippetId") }
      : {}),
    ...(stringField(formData, "revisionId")
      ? { revisionId: stringField(formData, "revisionId") }
      : {}),
    slug: stringField(formData, "slug"),
    changeSummary: stringField(formData, "changeSummary"),
    codeLicense: stringField(formData, "codeLicense"),
    previewScriptKey: stringField(formData, "previewScriptKey"),
    scripts,
    units,
    references,
    contributors,
    tagIds,
    localizations,
  };
}

function editorRedirect(snippetId: string, notice: string) {
  return redirect(
    `/admin/snippets/${snippetId}?notice=${encodeURIComponent(notice)}`,
  );
}

export async function action({ context, request }: Route.ActionArgs) {
  const actor = context.get(adminActorContext);
  const { db, env } = context.get(platformContext);
  const formData = await request.formData();
  const intent = stringField(formData, "intent");
  const snippetId = stringField(formData, "snippetId");
  const revisionId = stringField(formData, "revisionId");
  try {
    if (intent === "save") {
      requireCapability(actor, "snippets:write");
      const saved = await saveAdminSnippetDraft(
        db,
        actor,
        parseDraftInput(formData),
      );
      const file = formData.get("demoFile");
      if (file instanceof File && file.size > 0) {
        await storeAdminDemoArtifact(
          db,
          env.ARTIFACTS,
          saved.revisionId,
          file,
          {
            license: stringField(formData, "demoLicense"),
            attribution: stringField(formData, "demoAttribution"),
          },
        );
      } else if (stringField(formData, "removeDemo") === "true") {
        await removeAdminDemoArtifact(db, env.ARTIFACTS, saved.revisionId);
      }
      return editorRedirect(saved.snippetId, "saved");
    }
    if (intent === "publish") {
      requireCapability(actor, "snippets:publish");
      await publishAdminSnippetDraft(db, snippetId, revisionId);
      return editorRedirect(snippetId, "published");
    }
    if (intent.startsWith("publish-locale:")) {
      requireCapability(actor, "snippets:publish");
      const locale = canonicalizeLocale(intent.slice("publish-locale:".length));
      if (locale !== "zh-CN" && locale !== "zh-TW") {
        throw new AdminContentError("INVALID_INPUT", "不能单独发布该语言");
      }
      await publishAdminLocalizationDraft(db, snippetId, revisionId, locale);
      return editorRedirect(snippetId, `published-${locale}`);
    }
    if (intent === "archive" || intent === "restore") {
      requireCapability(actor, "snippets:archive");
      await setAdminSnippetArchived(db, snippetId, intent === "archive");
      return editorRedirect(
        snippetId,
        intent === "archive" ? "archived" : "restored",
      );
    }
    if (intent === "delete") {
      requireCapability(actor, "snippets:write");
      await deleteUnpublishedAdminSnippet(db, env.ARTIFACTS, snippetId);
      return redirect("/admin/snippets?notice=deleted");
    }
    return data({ ok: false, message: "未知操作" }, { status: 400 });
  } catch (error) {
    if (error instanceof AdminContentError) {
      return data({ ok: false, message: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.name === "PublicationError") {
      return data({ ok: false, message: error.message }, { status: 400 });
    }
    throw error;
  }
}

export default function AdminSnippetEditorRoute(props: Route.ComponentProps) {
  return <AdminSnippetStudio {...props} />;
}
