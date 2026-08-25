# SSR routing and localization

## Route tree

React Router Framework Mode owns the public route tree and renders every public
content page on the Worker:

- `/` negotiates `Accept-Language` and redirects to a supported locale root.
- `/:locale` renders the localized landing page.
- `/:locale/snippets` renders the published snippet index.
- `/:locale/snippets/:slug` resolves the current published revision and its
  compatible localization.

URL locale segments are lowercase (`zh-cn`) while route loaders, UI messages,
and D1 values use canonical BCP 47 (`zh-CN`). Supported but non-canonical URL
spellings receive a permanent redirect. Unsupported locale prefixes return a
404 with links to supported locales.

## UI and content localization

UI messages are bundled application resources. Snippet content is loaded from
D1 and has its own revision and publication lifecycle. The two mechanisms do
not share persistence or revision state.

English is the global content fallback. Index loaders choose at most one search
document per snippet: the requested locale when it exists, otherwise English.
Detail loaders apply the same rule and only serve localizations whose
translation basis hash matches the published code revision. A fallback notice
is rendered whenever the content locale differs from the requested locale.

## Page responses

Public pages emit short browser and edge cache directives. Each successful page
sets localized title and description metadata plus a canonical URL. Detail
pages additionally emit locale alternate links and `SoftwareSourceCode`
structured data. Not-found detail loaders preserve a real HTTP 404 response.

The document `lang` attribute always uses the canonical locale. Locale routing,
data loading, fallback selection, and SEO metadata happen during SSR; client
JavaScript enhances navigation but is not required to receive content.
