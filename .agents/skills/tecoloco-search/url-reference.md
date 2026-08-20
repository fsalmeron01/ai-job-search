# Tecoloco.com.sv — URL & Parsing Reference

Investigated live 2026-08-20. Record this file's findings as ground truth for
`cli/src/helpers.ts`; update both together if Tecoloco changes its markup.

## Access

- **robots.txt** (`https://www.tecoloco.com.sv/robots.txt`): `User-agent: *` /
  `Content-Signal: search=yes,ai-train=no,use=reference` / `Allow: /`. Explicit
  disallows are limited to `/SelectNewsReader.aspx?`, `/AddRssLink.aspx?`,
  `/partners/ads-data?`, `/company-questionnaire`, `/WebService/AjaxWS.asmx/`
  (used by the site's own AJAX refinement widgets — **not used by this CLI**),
  plus a named-bot blocklist (`ClaudeBot`, `GPTBot`, `Amazonbot`, `Bytespider`,
  `CCBot`, `Google-Extended`, `Applebot-Extended`, `meta-externalagent`,
  `AhrefsBot`, `CloudflareBrowserRenderingCrawler`). This CLI identifies itself
  as `tecoloco-search-cli/1.0`, an honest tool-naming UA, not any of those
  crawler names, so it falls under the general `User-agent: *` / `Allow: /`
  rule — the paths this CLI hits (`/empleos`, `/JobDesc.aspx`) are not
  disallowed for it.
- **Terms of use** (`https://www.tecoloco.com.sv/condiciones`, section
  "Propiedad Intelectual"): site content "no puede ser utilizado por ninguna
  persona o entidad para su duplicación, reproducción o difusión ... sin el
  consentimiento explícito de Tecoloco." Broad IP/reproduction language, not a
  scraping-specific "no bots/no automated access" clause (contrast LinkedIn's
  ToS), but the SKILL.md carries a personal-use-only warning out of caution,
  matching this repo's treatment of `linkedin-search`.
- No login required to view search results or individual job postings.
  Applying to a job (not implemented by this CLI) requires a Tecoloco account.

## Search

```
GET https://www.tecoloco.com.sv/empleos?Keywords=<query>&Page=<n>&PerPage=<size>
```

| Param | Notes |
|---|---|
| `Keywords` | Free-text query (job title, skill, company). URL-encoded, spaces as `+`. |
| `Page` | 1-indexed. Omit for page 1. |
| `PerPage` | `40` (default when omitted), `80`, or `100` — the site's own UI only exposes these three. |
| `Categoria` | Category ID (from the homepage `<select id="Categoria">`) — not used by this CLI; category-based URLs like `/empleo-call-center?Keywords=...` exist but are a separate path pattern, not a query param. |
| `PaisId` | Country ID — always `21` (El Salvador) on this TLD; the site itself is El Salvador-only, so this CLI never sets it. |

No location/city parameter exists. No posting-age ("jobage") parameter exists — the
default sort is `SortedBy=MostRecent`; there's also `SortedBy=Relevance`, exposed only
via the results page's own `<select id="SortedBy">`, not documented here since it isn't
wired into the CLI (results are already most-recent-first by default, which is the
common case).

Total match count for a query appears in `<label class="jobsFound">Total de ofertas
activas: <span class="ofertasactivas"> N</span></label>` — not currently surfaced by the
CLI (the JSON `meta.count` is the count of results returned in this page/limit, not the
portal's total).

### Result markup

Each job renders **twice** in the response: once as `<div class="job-card">` (desktop)
and once as `<div class="job-card-mobile">` (mobile) — CSS toggles which is shown, both
are always present in the HTML. `parseJobCards` parses only `.job-card-mobile` blocks so
each job is counted once. The mobile variant's location span also reliably includes the
city when Tecoloco has one for that posting (`San Salvador, El Salvador`); the desktop
variant sometimes shows country only, even for the same job.

Within a `.job-card-mobile` block:

| Field | Anchor |
|---|---|
| id | `data-job-id="<id>"` attribute (on the share button in `.job-card-mobile__row-1`) |
| url | `data-share-url="/<id>/<slug>.aspx"` attribute, same element — resolved against `https://www.tecoloco.com.sv` |
| title | `<h2 class="job-card-mobile__title" itemprop="title"><a ...>TITLE</a></h2>` |
| company | `<span class="job-card-mobile__company-name subtitle">COMPANY</span>` |
| location | `<span class="job-card-mobile__location">...</span>` — may contain a nested `<span>` wrapping just the country (`<i class="map-point"></i>San Salvador,&nbsp;<span>El Salvador</span>`) or just the country alone with no city. Captured up to the sibling `<span class="job-card-mobile__expiry">` rather than the first `</span>`, so the nested tag doesn't truncate the city. |
| date | **Not available.** The card only shows `Expira en: DD/MM/YYYY` (expiration), never a posting date. `parseJobCards` always emits `date: null`; the real posting date is on the detail page only (`publishedDate`). |

Pagination links appear in `<ul id="pagination">` as full URLs
(`?Keywords=...&Page=N`) — not needed by the CLI since it constructs its own.

## Detail

Canonical posting URL from search results: `/<id>/<slug>.aspx` (e.g.
`/1102092/vendedor.aspx`). **This 404s if the slug doesn't match exactly** — Tecoloco
does not treat the slug as decorative. Since `search` only hands back a numeric ID to
the caller (not the slug), `detail` instead always fetches:

```
GET https://www.tecoloco.com.sv/JobDesc.aspx?ID=<id>
```

which renders the identical page regardless of slug, 200s for any valid ID, and 404s
("Job not found" `<title>`) for an invalid one — confirmed live against both a real ID
and `999999999`.

### Detail markup

| Field | Anchor |
|---|---|
| title | `<h1 class="job-title">TITLE</h1>` |
| company | `<p class="job-company">COMPANY</p>` |
| location | `job-info-item` whose `job-info-label` starts with `Ubicaci` (i.e. "Ubicación:", HTML-entity-escaped as `Ubicaci&oacute;n:`) |
| employmentType | `job-info-label` starting `Tipo de contrataci` ("Tipo de contratación:") — e.g. "Tiempo completo" |
| publishedDate | `job-info-label` starting `Fecha de Publicaci` ("Fecha de Publicación", no trailing colon in the source) — `DD/MM/YYYY` |
| expirationDate | `job-info-label` starting `Fecha de Expiraci` ("Fecha de Expiración:") — `DD/MM/YYYY` |
| experienceLevel | `job-info-label` starting `Nivel de experiencia` |
| description | `<h3 class="section-title">Descripción de la oferta</h3>` followed by `<div class="section-content">...</div>` — employer-authored HTML (headings, `<p>`, `<ul><li>`), occasionally containing a nested `<div>`. Extracted with the existing depth-tracked `extractDivContent` helper, then converted to text preserving paragraph/list-item breaks (see `htmlBlockToText` in helpers.ts — a plain `stripTags` call collapses `\n` as whitespace and silently flattens every description to one line, so breaks are marked with a private-use placeholder character until the final split). |
| applyUrl | Not present as a direct link. Every posting wires `.btn-apply`/`.apply-job` buttons to `saon.Api.Apply = '/Jobs/Aplicar'` client-side JS, i.e. `/Jobs/Aplicar/<id>` — this always requires a Tecoloco account login (`Crea una cuenta o ingresa antes de aplicar` appears for logged-out users). No posting observed during investigation exposed a direct external company apply link instead. |

`job-info-value` spans sometimes wrap their text in a redundant nested `<span>` (seen on
`location`) — tag-stripping handles this fine since unmatched/dangling tags are simply
removed by the generic `<[^>]+>` replace, not by proper nesting logic.

There is also a `<table class="details-table">` ("Detalles de la oferta") with
additional fields (Área de la empresa, Cargo solicitado, Puestos vacantes, Vehículo,
País, Departamento) — not surfaced by this CLI; parse it the same
label/value way if a future need arises.

## Verified live (2026-08-20)

- Query `atencion al cliente` → **899** total matches sat behind pagination
  (`PerPage=40` default → ~23 pages), first page returned 40 unique job IDs.
- `search -q "atencion al cliente" --limit 5 --format table` returned real,
  non-placeholder titles/companies/locations (e.g. "Dependiente de tienda san
  miguel..." / "Megapaca El Salvador" / "San Miguel, El Salvador").
- `detail 1102457` and `detail 1102092` both returned full, readable
  descriptions with paragraph/list breaks preserved, correct contract type,
  experience level, and publish/expiration dates.
- `detail 999999999` (bogus ID) returned `NOT_FOUND` / exit 1, confirming the
  404 path works without throwing.
