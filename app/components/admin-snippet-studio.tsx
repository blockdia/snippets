import {
  ArchiveBoxIcon,
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  CodeBlockIcon,
  FileArrowUpIcon,
  FloppyDiskIcon,
  GlobeIcon,
  LinkIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  TranslateIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Form,
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigation,
} from "react-router";

import type { Locale } from "../i18n/locales";
import type {
  AdminContributorInput,
  AdminLocalizationInput,
  AdminReferenceInput,
  AdminScriptInput,
  AdminSnippetEditor,
  AdminTagRecord,
  AdminUnitInput,
} from "../services/admin.server";
import { ScratchblocksConfigProvider } from "./scratchblocks-config";
import {
  ScratchblocksRenderer,
  type ScratchblocksLabels,
} from "./scratchblocks-renderer";
import { SnippetMarkdown } from "./snippet-markdown";

interface StudioProps {
  loaderData: {
    editor: AdminSnippetEditor | null;
    tags: AdminTagRecord[];
    notice: string | null;
  };
  actionData?: { ok: boolean; message: string };
}

interface StudioState {
  slug: string;
  changeSummary: string;
  codeLicense: string;
  previewScriptKey: string;
  scripts: AdminScriptInput[];
  units: AdminUnitInput[];
  references: AdminReferenceInput[];
  contributors: AdminContributorInput[];
  tagIds: string[];
  localizations: AdminLocalizationInput[];
  demoLicense: string;
  demoAttribution: string;
  removeDemo: boolean;
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

const SCRATCH_LABELS: ScratchblocksLabels = {
  copy: "复制",
  copied: "已复制",
  copyFailed: "复制失败",
  exportSvg: "导出 SVG",
  exportPng: "导出 PNG",
  renderFailed: "无法渲染积木",
  codePreview: "Scratch 积木预览",
};

const NOTICE_MESSAGES: Record<string, string> = {
  saved: "草稿已保存",
  published: "代码与英文内容已发布",
  "published-zh-CN": "简体中文内容已发布",
  "published-zh-TW": "繁体中文内容已发布",
  archived: "Snippet 已归档",
  restored: "Snippet 已恢复并重新建立搜索索引",
};

function emptyLocalization(locale: Locale): AdminLocalizationInput {
  return {
    locale,
    title: "",
    summary: "",
    seoTitle: "",
    seoDescription: "",
    bodyMarkdown: "",
    keywords: [],
    proseLicense: "CC-BY-SA-4.0",
    basisAccepted: locale === "en",
    scriptOverrides: [],
    units: [],
  };
}

function initialState(editor: AdminSnippetEditor | null): StudioState {
  if (!editor) {
    return {
      slug: "",
      changeSummary: "创建初始版本",
      codeLicense: "CC0-1.0",
      previewScriptKey: "main",
      scripts: [
        {
          key: "main",
          title: "Main",
          source: "when green flag clicked\n",
        },
      ],
      units: [],
      references: [],
      contributors: [],
      tagIds: [],
      localizations: [
        emptyLocalization("en"),
        emptyLocalization("zh-CN"),
        emptyLocalization("zh-TW"),
      ],
      demoLicense: "CC-BY-4.0",
      demoAttribution: "",
      removeDemo: false,
    };
  }
  return {
    slug: editor.snippet.slug,
    changeSummary: editor.revision.changeSummary,
    codeLicense: editor.revision.codeLicense,
    previewScriptKey:
      editor.revision.previewScriptKey || editor.scripts[0]?.key || "",
    scripts: editor.scripts,
    units: editor.units,
    references: editor.references,
    contributors: editor.contributors,
    tagIds: editor.tagIds,
    localizations: editor.localizations.map((localization) => ({
      locale: localization.locale,
      title: localization.title,
      summary: localization.summary,
      seoTitle: localization.seoTitle,
      seoDescription: localization.seoDescription,
      bodyMarkdown: localization.bodyMarkdown,
      keywords: localization.keywords,
      proseLicense: localization.proseLicense,
      basisAccepted: localization.basisAccepted,
      scriptOverrides: localization.scriptOverrides,
      units: localization.units,
    })),
    demoLicense: editor.demo?.license ?? "CC-BY-4.0",
    demoAttribution: editor.demo?.attribution ?? "",
    removeDemo: false,
  };
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

function statusLabel(editor: AdminSnippetEditor | null): string {
  if (!editor) return "新内容";
  if (editor.snippet.status === "archived") return "已归档";
  if (editor.revision.status === "draft")
    return `草稿 v${editor.revision.number}`;
  return `已发布 v${editor.revision.number}`;
}

function SectionHeading({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof CodeBlockIcon;
  title: string;
}) {
  return (
    <header className="admin-editor-section-heading">
      <span>
        <Icon aria-hidden="true" size={21} weight="duotone" />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function AdminSnippetStudio({ actionData, loaderData }: StudioProps) {
  const editor = loaderData.editor;
  const [state, setState] = useState(() => initialState(editor));
  const [activeLocale, setActiveLocale] = useState<Locale>("en");
  const [previewLocale, setPreviewLocale] = useState<Locale>("en");
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const navigation = useNavigation();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !submitting.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("有尚未保存的修改，确定要离开吗？")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!dirty) return;
        event.preventDefault();
      },
      [dirty],
    ),
  );

  const markDirty = () => setDirty(true);
  const updateState = <K extends keyof StudioState>(
    key: K,
    value: StudioState[K],
  ) => {
    setState((current) => ({
      ...current,
      [key]: value,
      ...(["scripts", "units", "references"].includes(key)
        ? {
            localizations: current.localizations.map((entry) =>
              entry.locale === "en"
                ? entry
                : { ...entry, basisAccepted: false },
            ),
          }
        : {}),
    }));
    markDirty();
  };
  const updateLocalization = (
    locale: Locale,
    updater: (value: AdminLocalizationInput) => AdminLocalizationInput,
  ) => {
    setState((current) => ({
      ...current,
      localizations: current.localizations.map((localization) =>
        localization.locale === locale ? updater(localization) : localization,
      ),
    }));
    markDirty();
  };
  const localization =
    state.localizations.find((entry) => entry.locale === activeLocale) ??
    emptyLocalization(activeLocale);
  const previewLocalization =
    state.localizations.find((entry) => entry.locale === previewLocale) ??
    emptyLocalization(previewLocale);
  const previewScript =
    state.scripts.find((script) => script.key === state.previewScriptKey) ??
    state.scripts[0];
  const previewOverride = previewLocalization.scriptOverrides.find(
    (entry) => entry.key === previewScript?.key,
  );
  const sourceLocale: Locale = previewOverride ? previewLocale : "en";
  const isBusy = navigation.state !== "idle";
  const canPublish =
    editor !== null && editor.revision.status === "draft" && !dirty && !isBusy;
  const status = statusLabel(editor);

  const submitLabel = isBusy ? "正在保存…" : "保存草稿";
  const publicUrl = editor?.snippet.hasPublication
    ? `/zh-cn/snippets/${editor.snippet.slug}`
    : null;
  const currentLocaleMeta = editor?.localizations.find(
    (entry) => entry.locale === activeLocale,
  );

  const scriptJson = useMemo(
    () => JSON.stringify(state.scripts),
    [state.scripts],
  );
  const unitJson = useMemo(() => JSON.stringify(state.units), [state.units]);
  const referenceJson = useMemo(
    () => JSON.stringify(state.references),
    [state.references],
  );
  const contributorJson = useMemo(
    () => JSON.stringify(state.contributors),
    [state.contributors],
  );
  const tagJson = useMemo(() => JSON.stringify(state.tagIds), [state.tagIds]);
  const localizationJson = useMemo(
    () => JSON.stringify(state.localizations),
    [state.localizations],
  );

  return (
    <ScratchblocksConfigProvider>
      <main className="admin-editor-page">
        <header className="admin-editor-topbar">
          <div>
            <Link to="/admin/snippets">Snippets</Link>
            <span>/</span>
            <strong>{state.slug || "新建"}</strong>
            <span
              className={`admin-status-pill ${editor?.snippet.status ?? "draft"}`}
            >
              {status}
            </span>
          </div>
          {publicUrl ? (
            <a href={publicUrl} target="_blank" rel="noreferrer">
              查看公开页 <ArrowSquareOutIcon aria-hidden="true" size={15} />
            </a>
          ) : null}
        </header>

        {loaderData.notice && NOTICE_MESSAGES[loaderData.notice] ? (
          <p className="admin-feedback success" role="status">
            <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
            {NOTICE_MESSAGES[loaderData.notice]}
          </p>
        ) : null}
        {actionData && !actionData.ok ? (
          <p className="admin-feedback error" role="alert">
            {actionData.message}
          </p>
        ) : null}

        <Form
          className="admin-editor-form"
          encType="multipart/form-data"
          method="post"
          onSubmit={() => {
            submitting.current = true;
          }}
        >
          <input
            name="snippetId"
            type="hidden"
            value={editor?.snippet.id ?? ""}
          />
          <input
            name="revisionId"
            type="hidden"
            value={editor?.revision.id ?? ""}
          />
          <input name="scripts" type="hidden" value={scriptJson} />
          <input name="units" type="hidden" value={unitJson} />
          <input name="references" type="hidden" value={referenceJson} />
          <input name="contributors" type="hidden" value={contributorJson} />
          <input name="tagIds" type="hidden" value={tagJson} />
          <input name="localizations" type="hidden" value={localizationJson} />
          <input
            name="removeDemo"
            type="hidden"
            value={String(state.removeDemo)}
          />

          <aside className="admin-editor-sections" aria-label="编辑器分区">
            <a href="#basic">
              <GlobeIcon size={17} />
              基础信息
            </a>
            <a href="#code">
              <CodeBlockIcon size={17} />
              Scratch 代码
            </a>
            <a href="#content">
              <TranslateIcon size={17} />
              三语内容
            </a>
            <a href="#classification">
              <TagIcon size={17} />
              分类与署名
            </a>
            <a href="#demo">
              <FileArrowUpIcon size={17} />
              演示项目
            </a>
            {editor ? (
              <a href="#history">
                <ClockCounterClockwiseIcon size={17} />
                版本历史
              </a>
            ) : null}
          </aside>

          <div className="admin-editor-content">
            <section className="admin-editor-card" id="basic">
              <SectionHeading
                description="稳定标识与版本说明。首次发布后 slug 将锁定。"
                icon={GlobeIcon}
                title="基础信息"
              />
              <input name="slug" type="hidden" value={state.slug} />
              <div className="admin-form-grid two-columns">
                <label className="admin-form-field">
                  <span>Slug</span>
                  <input
                    disabled={Boolean(editor?.snippet.hasPublication)}
                    onChange={(event) =>
                      updateState("slug", event.currentTarget.value)
                    }
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    placeholder="draw-circle"
                    required
                    value={state.slug}
                  />
                  <small>公开 URL 中使用的小写稳定标识。</small>
                </label>
                <label className="admin-form-field">
                  <span>代码许可证</span>
                  <input
                    name="codeLicense"
                    onChange={(event) =>
                      updateState("codeLicense", event.currentTarget.value)
                    }
                    required
                    value={state.codeLicense}
                  />
                </label>
              </div>
              <label className="admin-form-field">
                <span>本次变更摘要</span>
                <input
                  name="changeSummary"
                  onChange={(event) =>
                    updateState("changeSummary", event.currentTarget.value)
                  }
                  placeholder="说明这个版本为什么存在"
                  value={state.changeSummary}
                />
              </label>
            </section>

            <section className="admin-editor-card" id="code">
              <SectionHeading
                description="脚本 key 会连接翻译、预览与版本历史，请保持稳定。"
                icon={CodeBlockIcon}
                title="Scratch 代码"
              />
              {editor?.revision.representation === "scratch-blocks-ast" ? (
                <div className="admin-readonly-notice">
                  当前版本使用 scratch-blocks-ast，首期编辑器仅支持只读查看。
                </div>
              ) : (
                <>
                  <label className="admin-form-field admin-preview-select">
                    <span>卡片预览脚本</span>
                    <select
                      name="previewScriptKey"
                      onChange={(event) =>
                        updateState(
                          "previewScriptKey",
                          event.currentTarget.value,
                        )
                      }
                      value={state.previewScriptKey}
                    >
                      {state.scripts.map((script) => (
                        <option key={script.key} value={script.key}>
                          {script.title || script.key}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="admin-script-list">
                    {state.scripts.map((script, index) => (
                      <article
                        className="admin-script-editor"
                        key={`${script.key}-${index}`}
                      >
                        <header>
                          <strong>脚本 {index + 1}</strong>
                          <div>
                            <button
                              aria-label="上移脚本"
                              disabled={index === 0}
                              onClick={() =>
                                updateState(
                                  "scripts",
                                  move(state.scripts, index, -1),
                                )
                              }
                              type="button"
                            >
                              <ArrowUpIcon size={15} />
                            </button>
                            <button
                              aria-label="下移脚本"
                              disabled={index === state.scripts.length - 1}
                              onClick={() =>
                                updateState(
                                  "scripts",
                                  move(state.scripts, index, 1),
                                )
                              }
                              type="button"
                            >
                              <ArrowDownIcon size={15} />
                            </button>
                            <button
                              aria-label="删除脚本"
                              disabled={state.scripts.length === 1}
                              onClick={() => {
                                const next = state.scripts.filter(
                                  (_, scriptIndex) => scriptIndex !== index,
                                );
                                updateState("scripts", next);
                                if (state.previewScriptKey === script.key) {
                                  updateState(
                                    "previewScriptKey",
                                    next[0]?.key ?? "",
                                  );
                                }
                              }}
                              type="button"
                            >
                              <TrashIcon size={15} />
                            </button>
                          </div>
                        </header>
                        <div className="admin-form-grid two-columns">
                          <label className="admin-form-field">
                            <span>稳定 key</span>
                            <input
                              onChange={(event) =>
                                updateState(
                                  "scripts",
                                  state.scripts.map((entry, scriptIndex) =>
                                    scriptIndex === index
                                      ? {
                                          ...entry,
                                          key: event.currentTarget.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              value={script.key}
                            />
                          </label>
                          <label className="admin-form-field">
                            <span>英文标题</span>
                            <input
                              onChange={(event) =>
                                updateState(
                                  "scripts",
                                  state.scripts.map((entry, scriptIndex) =>
                                    scriptIndex === index
                                      ? {
                                          ...entry,
                                          title: event.currentTarget.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              value={script.title}
                            />
                          </label>
                        </div>
                        <label className="admin-form-field">
                          <span>Scratchblocks</span>
                          <textarea
                            onChange={(event) =>
                              updateState(
                                "scripts",
                                state.scripts.map((entry, scriptIndex) =>
                                  scriptIndex === index
                                    ? {
                                        ...entry,
                                        source: event.currentTarget.value,
                                      }
                                    : entry,
                                ),
                              )
                            }
                            rows={7}
                            spellCheck={false}
                            value={script.source}
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                  <button
                    className="admin-add-button"
                    onClick={() =>
                      updateState("scripts", [
                        ...state.scripts,
                        {
                          key: `script-${state.scripts.length + 1}`,
                          title: "",
                          source: "",
                        },
                      ])
                    }
                    type="button"
                  >
                    <PlusIcon size={16} />
                    添加脚本
                  </button>
                </>
              )}
            </section>

            <section className="admin-editor-card" id="content">
              <SectionHeading
                description="英文是发布基准；中文可在确认与当前代码兼容后独立发布。"
                icon={TranslateIcon}
                title="三语内容"
              />
              <div
                className="admin-locale-tabs"
                role="tablist"
                aria-label="内容语言"
              >
                {state.localizations.map((entry) => {
                  const meta = editor?.localizations.find(
                    (item) => item.locale === entry.locale,
                  );
                  return (
                    <button
                      aria-selected={activeLocale === entry.locale}
                      className={activeLocale === entry.locale ? "active" : ""}
                      key={entry.locale}
                      onClick={() => setActiveLocale(entry.locale)}
                      role="tab"
                      type="button"
                    >
                      {LOCALE_LABELS[entry.locale]}
                      <span
                        className={
                          meta?.compatible
                            ? "ready"
                            : entry.title
                              ? "warning"
                              : "empty"
                        }
                      />
                    </button>
                  );
                })}
              </div>
              {activeLocale !== "en" &&
              currentLocaleMeta &&
              !currentLocaleMeta.compatible ? (
                <label className="admin-basis-warning">
                  <input
                    checked={localization.basisAccepted}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      updateLocalization(activeLocale, (entry) => ({
                        ...entry,
                        basisAccepted: checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>
                    <strong>翻译基准已变化</strong>
                    我已检查此翻译与当前代码兼容，保存为新的翻译草稿。
                  </span>
                </label>
              ) : null}
              <div className="admin-form-grid two-columns">
                <label className="admin-form-field">
                  <span>标题</span>
                  <input
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateLocalization(activeLocale, (entry) => ({
                        ...entry,
                        title: value,
                      }));
                    }}
                    required={activeLocale === "en"}
                    value={localization.title}
                  />
                </label>
                <label className="admin-form-field">
                  <span>关键词</span>
                  <input
                    onChange={(event) => {
                      const keywords = event.currentTarget.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean);
                      updateLocalization(activeLocale, (entry) => ({
                        ...entry,
                        keywords,
                      }));
                    }}
                    placeholder="逗号分隔"
                    value={localization.keywords.join(", ")}
                  />
                </label>
              </div>
              <label className="admin-form-field">
                <span>摘要</span>
                <textarea
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateLocalization(activeLocale, (entry) => ({
                      ...entry,
                      summary: value,
                    }));
                  }}
                  required={activeLocale === "en"}
                  rows={2}
                  value={localization.summary}
                />
              </label>
              <label className="admin-form-field">
                <span>Markdown 正文</span>
                <textarea
                  className="admin-markdown-editor"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateLocalization(activeLocale, (entry) => ({
                      ...entry,
                      bodyMarkdown: value,
                    }));
                  }}
                  rows={14}
                  value={localization.bodyMarkdown}
                />
              </label>
              <details className="admin-advanced-fields">
                <summary>SEO、许可证与翻译脚本</summary>
                <div className="admin-form-grid two-columns">
                  <label className="admin-form-field">
                    <span>SEO 标题</span>
                    <input
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateLocalization(activeLocale, (entry) => ({
                          ...entry,
                          seoTitle: value,
                        }));
                      }}
                      value={localization.seoTitle}
                    />
                  </label>
                  <label className="admin-form-field">
                    <span>SEO 描述</span>
                    <input
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateLocalization(activeLocale, (entry) => ({
                          ...entry,
                          seoDescription: value,
                        }));
                      }}
                      value={localization.seoDescription}
                    />
                  </label>
                  <label className="admin-form-field">
                    <span>内容许可证</span>
                    <input
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateLocalization(activeLocale, (entry) => ({
                          ...entry,
                          proseLicense: value,
                        }));
                      }}
                      value={localization.proseLicense}
                    />
                  </label>
                </div>
                {activeLocale !== "en" ? (
                  <div className="admin-localized-scripts">
                    <h3>本地化脚本覆盖</h3>
                    {state.scripts.map((script) => {
                      const override = localization.scriptOverrides.find(
                        (entry) => entry.key === script.key,
                      );
                      return (
                        <label className="admin-form-field" key={script.key}>
                          <span>{script.title || script.key}</span>
                          <textarea
                            onChange={(event) => {
                              const source = event.currentTarget.value;
                              updateLocalization(activeLocale, (entry) => ({
                                ...entry,
                                scriptOverrides: [
                                  ...entry.scriptOverrides.filter(
                                    (item) => item.key !== script.key,
                                  ),
                                  { key: script.key, source },
                                ],
                              }));
                            }}
                            placeholder="留空则使用英文代码"
                            rows={5}
                            value={override?.source ?? ""}
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </details>
              {activeLocale !== "en" &&
              editor?.revision.status === "published" ? (
                <button
                  className="admin-secondary-button admin-publish-locale"
                  disabled={
                    dirty ||
                    !currentLocaleMeta ||
                    currentLocaleMeta.status !== "draft"
                  }
                  name="intent"
                  onClick={(event) => {
                    if (
                      !window.confirm(
                        `确认发布${LOCALE_LABELS[activeLocale]}内容？`,
                      )
                    )
                      event.preventDefault();
                  }}
                  type="submit"
                  value={`publish-locale:${activeLocale}`}
                >
                  <TranslateIcon size={16} />
                  发布{LOCALE_LABELS[activeLocale]}
                </button>
              ) : null}
            </section>

            <section className="admin-editor-card" id="classification">
              <SectionHeading
                description="标签、来源链接和贡献者会随代码版本一起保存。"
                icon={TagIcon}
                title="分类与署名"
              />
              <fieldset className="admin-tag-picker">
                <legend>标签</legend>
                {loaderData.tags.map((tag) => (
                  <label key={tag.id}>
                    <input
                      checked={state.tagIds.includes(tag.id)}
                      onChange={(event) =>
                        updateState(
                          "tagIds",
                          event.currentTarget.checked
                            ? [...state.tagIds, tag.id]
                            : state.tagIds.filter((id) => id !== tag.id),
                        )
                      }
                      type="checkbox"
                    />
                    <span>{tag.localizations["zh-CN"].name || tag.slug}</span>
                  </label>
                ))}
                <Link to="/admin/tags">管理标签</Link>
              </fieldset>
              <details
                className="admin-advanced-fields"
                open={state.references.length > 0}
              >
                <summary>
                  <LinkIcon size={16} />
                  参考链接
                </summary>
                <div className="admin-repeater-list">
                  {state.references.map((reference, index) => (
                    <div
                      className="admin-reference-row"
                      key={`${reference.key}-${index}`}
                    >
                      <input
                        aria-label="参考链接 key"
                        onChange={(event) =>
                          updateState(
                            "references",
                            state.references.map((entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, key: event.currentTarget.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="key"
                        value={reference.key}
                      />
                      <input
                        aria-label="参考链接标题"
                        onChange={(event) =>
                          updateState(
                            "references",
                            state.references.map((entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, title: event.currentTarget.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="标题"
                        value={reference.title}
                      />
                      <input
                        aria-label="参考链接 URL"
                        onChange={(event) =>
                          updateState(
                            "references",
                            state.references.map((entry, itemIndex) =>
                              itemIndex === index
                                ? { ...entry, url: event.currentTarget.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="https://"
                        type="url"
                        value={reference.url}
                      />
                      <select
                        aria-label="参考链接类型"
                        onChange={(event) =>
                          updateState(
                            "references",
                            state.references.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    kind: event.currentTarget
                                      .value as AdminReferenceInput["kind"],
                                  }
                                : entry,
                            ),
                          )
                        }
                        value={reference.kind}
                      >
                        {(
                          [
                            "article",
                            "project",
                            "video",
                            "extension",
                            "repository",
                            "other",
                          ] as const
                        ).map((kind) => (
                          <option key={kind}>{kind}</option>
                        ))}
                      </select>
                      <button
                        aria-label="删除参考链接"
                        onClick={() =>
                          updateState(
                            "references",
                            state.references.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        type="button"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="admin-add-button"
                  onClick={() =>
                    updateState("references", [
                      ...state.references,
                      {
                        key: `reference-${state.references.length + 1}`,
                        title: "",
                        url: "",
                        kind: "other",
                      },
                    ])
                  }
                  type="button"
                >
                  <PlusIcon size={15} />
                  添加参考链接
                </button>
              </details>
              <details
                className="admin-advanced-fields"
                open={state.contributors.length > 0}
              >
                <summary>
                  <UserCircleIcon size={16} />
                  贡献者
                </summary>
                <div className="admin-repeater-list">
                  {state.contributors.map((contributor, index) => (
                    <div
                      className="admin-contributor-row"
                      key={contributor.id ?? index}
                    >
                      <input
                        aria-label="贡献者名称"
                        onChange={(event) =>
                          updateState(
                            "contributors",
                            state.contributors.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    displayName: event.currentTarget.value,
                                  }
                                : entry,
                            ),
                          )
                        }
                        placeholder="显示名称"
                        value={contributor.displayName}
                      />
                      <select
                        aria-label="贡献者类型"
                        onChange={(event) =>
                          updateState(
                            "contributors",
                            state.contributors.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    kind: event.currentTarget
                                      .value as AdminContributorInput["kind"],
                                  }
                                : entry,
                            ),
                          )
                        }
                        value={contributor.kind}
                      >
                        {(
                          [
                            "name",
                            "user",
                            "github",
                            "scratch",
                            "organization",
                          ] as const
                        ).map((kind) => (
                          <option key={kind}>{kind}</option>
                        ))}
                      </select>
                      <select
                        aria-label="贡献者角色"
                        onChange={(event) =>
                          updateState(
                            "contributors",
                            state.contributors.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    role: event.currentTarget
                                      .value as AdminContributorInput["role"],
                                  }
                                : entry,
                            ),
                          )
                        }
                        value={contributor.role}
                      >
                        {(["author", "maintainer", "source"] as const).map(
                          (role) => (
                            <option key={role}>{role}</option>
                          ),
                        )}
                      </select>
                      <input
                        aria-label="贡献者主页"
                        onChange={(event) =>
                          updateState(
                            "contributors",
                            state.contributors.map((entry, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...entry,
                                    profileUrl: event.currentTarget.value,
                                  }
                                : entry,
                            ),
                          )
                        }
                        placeholder="主页 URL"
                        type="url"
                        value={contributor.profileUrl ?? ""}
                      />
                      <button
                        aria-label="删除贡献者"
                        onClick={() =>
                          updateState(
                            "contributors",
                            state.contributors.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        type="button"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="admin-add-button"
                  onClick={() =>
                    updateState("contributors", [
                      ...state.contributors,
                      { kind: "name", displayName: "", role: "author" },
                    ])
                  }
                  type="button"
                >
                  <PlusIcon size={15} />
                  添加贡献者
                </button>
              </details>
            </section>

            <section className="admin-editor-card" id="demo">
              <SectionHeading
                description="仅支持 demo.sb3；文件使用 SHA-256 内容寻址存入私有 R2。"
                icon={FileArrowUpIcon}
                title="演示项目"
              />
              {editor?.demo && !state.removeDemo ? (
                <div className="admin-demo-current">
                  <FileArrowUpIcon size={28} weight="duotone" />
                  <span>
                    <strong>demo.sb3</strong>
                    <small>
                      {(editor.demo.byteSize / 1024).toFixed(1)} KiB ·{" "}
                      {editor.demo.sha256.slice(0, 12)}…
                    </small>
                  </span>
                  <button
                    className="admin-danger-button"
                    onClick={() => updateState("removeDemo", true)}
                    type="button"
                  >
                    <TrashIcon size={15} />
                    移除
                  </button>
                </div>
              ) : (
                <label className="admin-file-drop">
                  <FileArrowUpIcon
                    aria-hidden="true"
                    size={30}
                    weight="duotone"
                  />
                  <span>
                    <strong>选择 demo.sb3</strong>
                    <small>最大 25 MiB</small>
                  </span>
                  <input
                    accept=".sb3,application/x.scratch.sb3"
                    name="demoFile"
                    onChange={markDirty}
                    type="file"
                  />
                </label>
              )}
              <div className="admin-form-grid two-columns">
                <label className="admin-form-field">
                  <span>许可证</span>
                  <input
                    name="demoLicense"
                    onChange={(event) =>
                      updateState("demoLicense", event.currentTarget.value)
                    }
                    value={state.demoLicense}
                  />
                </label>
                <label className="admin-form-field">
                  <span>署名说明</span>
                  <input
                    name="demoAttribution"
                    onChange={(event) =>
                      updateState("demoAttribution", event.currentTarget.value)
                    }
                    value={state.demoAttribution}
                  />
                </label>
              </div>
            </section>

            {editor ? (
              <section className="admin-editor-card" id="history">
                <SectionHeading
                  description="发布版本不可原地修改，草稿会成为新的版本。"
                  icon={ClockCounterClockwiseIcon}
                  title="版本历史"
                />
                <ol className="admin-history-list">
                  {editor.history.map((revision) => (
                    <li key={revision.id}>
                      <span>v{revision.number}</span>
                      <div>
                        <strong>
                          {revision.changeSummary || "未填写变更摘要"}
                        </strong>
                        <small>
                          {revision.status} ·{" "}
                          {new Date(revision.createdAt).toLocaleString("zh-CN")}
                        </small>
                      </div>
                      {revision.status === "published" ? (
                        <CheckCircleIcon size={18} weight="fill" />
                      ) : (
                        <FileArrowUpIcon size={18} />
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <aside className="admin-editor-preview">
            <header>
              <strong>实时预览</strong>
              <select
                aria-label="预览语言"
                onChange={(event) =>
                  setPreviewLocale(event.currentTarget.value as Locale)
                }
                value={previewLocale}
              >
                {state.localizations.map((entry) => (
                  <option key={entry.locale} value={entry.locale}>
                    {LOCALE_LABELS[entry.locale]}
                  </option>
                ))}
              </select>
            </header>
            <div className="admin-preview-surface">
              <span className="admin-preview-kicker">Scratch Snippet</span>
              <h2>{previewLocalization.title || "未填写标题"}</h2>
              <p>{previewLocalization.summary || "摘要会显示在这里。"}</p>
              {previewScript ? (
                <ScratchblocksRenderer
                  labels={SCRATCH_LABELS}
                  scriptKey={previewScript.key}
                  source={previewOverride?.source || previewScript.source}
                  sourceLocale={sourceLocale}
                />
              ) : null}
              {previewLocalization.bodyMarkdown ? (
                <div className="admin-preview-markdown">
                  <SnippetMarkdown
                    labels={SCRATCH_LABELS}
                    locale={previewLocale}
                    markdown={previewLocalization.bodyMarkdown}
                  />
                </div>
              ) : null}
            </div>
          </aside>

          <footer className="admin-editor-actionbar">
            <div>
              {dirty ? (
                <span className="admin-unsaved-dot">有未保存修改</span>
              ) : (
                <span>所有修改已保存</span>
              )}
            </div>
            <div>
              {editor && !editor.snippet.hasPublication ? (
                <button
                  className="admin-danger-button"
                  name="intent"
                  onClick={(event) => {
                    if (
                      !window.confirm(
                        "删除这个尚未发布的 Snippet？此操作无法撤销。",
                      )
                    )
                      event.preventDefault();
                  }}
                  type="submit"
                  value="delete"
                >
                  <TrashIcon size={16} />
                  删除
                </button>
              ) : null}
              {editor?.snippet.hasPublication ? (
                <button
                  className="admin-secondary-button"
                  disabled={dirty}
                  name="intent"
                  onClick={(event) => {
                    const verb =
                      editor.snippet.status === "archived" ? "恢复" : "归档";
                    if (!window.confirm(`确认${verb}这个 Snippet？`))
                      event.preventDefault();
                  }}
                  type="submit"
                  value={
                    editor.snippet.status === "archived" ? "restore" : "archive"
                  }
                >
                  <ArchiveBoxIcon size={16} />
                  {editor.snippet.status === "archived" ? "恢复" : "归档"}
                </button>
              ) : null}
              <button
                className="admin-secondary-button"
                disabled={!canPublish}
                name="intent"
                onClick={(event) => {
                  if (!window.confirm("确认发布当前代码版本和英文内容？"))
                    event.preventDefault();
                }}
                type="submit"
                value="publish"
              >
                <CheckCircleIcon size={16} />
                发布
              </button>
              <button
                className="admin-primary-button"
                disabled={
                  isBusy ||
                  editor?.revision.representation === "scratch-blocks-ast"
                }
                name="intent"
                type="submit"
                value="save"
              >
                <FloppyDiskIcon size={17} weight="bold" />
                {submitLabel}
              </button>
            </div>
          </footer>
        </Form>
      </main>
    </ScratchblocksConfigProvider>
  );
}
