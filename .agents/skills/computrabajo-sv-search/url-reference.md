# Computrabajo El Salvador URL Reference

Public, unauthenticated, server-rendered pages used by this skill. No JSON API
was found behind the search/detail pages — everything is parsed from HTML.

> Personal use only — see SKILL.md for the Condiciones Legales note. Keep volume low.

## Domain

The public-facing URLs redirect through two hops to the canonical host:

```
https://www.computrabajo.com.sv  --301-->  https://www.computrabajo.sv  --301-->  https://sv.computrabajo.com
```

The CLI talks to `https://sv.computrabajo.com` directly (`BASE_URL` in `helpers.ts`).

## robots.txt (fetched live from `sv.computrabajo.com/robots.txt`)

```
User-agent: *
Disallow: /hojas-de-vida/*
Disallow: /curriculums/*
Disallow: /ofertas-de-trabajo/*dis=
Disallow: /ofertas-de-trabajo/*cont=
Disallow: /ofertas-de-trabajo/*pubdate=
Disallow: /ofertas-de-trabajo/*sal=
Disallow: /ofertas-de-trabajo/*by=
Disallow: /ofertas-de-trabajo/*emp=
Disallow: /ofertas-de-trabajo/*emcont=
Disallow: /ofertas-de-trabajo/*emsal=
Disallow: /ofertas-de-trabajo/*empubdate=
Disallow: /ofertas-de-trabajo/*ememsal=
Disallow: /ofertas-de-trabajo/*emdis=
Disallow: /ofertas-de-trabajo/*emq=
Disallow: /ofertas-de-trabajo/*ememq=
Disallow: /ofertas-de-trabajo/*ememcont=
Disallow: /ofertas-de-trabajo/*emempubdate
Disallow: /empresas/*city=
Disallow: /empresas/*cat=
Disallow: /empresas/*prov=
Disallow: /empresas/*t=
Disallow: /ofertas-de-trabajo/Detail/Print.aspx
Disallow: /Ajax/*
Disallow: /_services/*
Disallow: /go/*
```

The search path (`/trabajo-de-<slug>`) and the detail path
(`/ofertas-de-trabajo/<slug>-<id>`) are **not** disallowed. Only specific
query-string filters on `/ofertas-de-trabajo/*` are blocked — this CLI never
sends any of `dis=`, `cont=`, `pubdate=`, `sal=`, `by=`, `emp=`, `emcont=`,
`emsal=`, `empubdate=`, `ememsal=`, `emdis=`, `emq=`, `ememq=`, `ememcont=`,
`emempubdate`. Pagination uses `?p=<n>`, which is not in the disallow list.

**Condiciones Legales (`/avisolegal/`) explicitly prohibit automated access**
independent of robots.txt — see SKILL.md's personal-use warning for the exact
clauses. This is documented here as the reason the CLI keeps volume low.

## Search

```
GET https://sv.computrabajo.com/trabajo-de-{query-slug}[-en-{department-slug}][?p={page}]
```

- `{query-slug}`: the `--query` text run through `slugify()` — lowercase,
  accents stripped (NFD-normalize + drop combining marks), non-alphanumerics
  collapsed to hyphens. E.g. `"atención al cliente"` -> `atencion-al-cliente`.
  Verified against the site's own query-slug in its canonical URL.
- `{department-slug}`: same `slugify()` applied to `--location`. Verified
  live against the department-filter links embedded in the search page's
  filter panel (`data-id="idlocation"` list) — `slugify()` reproduces every
  one of the 14 department slugs exactly (e.g. `"Usulután"` -> `usulutan`,
  `"Cabañas"` -> `cabanas`). Filtering is **department-level only** — the
  page's city-level (`idcity`) list is populated client-side via AJAX after
  picking a department and was not reverse-engineered; pass a department
  name in `--location`, or fold a city name into `--query` for finer
  targeting (jobindex-search documents this same limitation for its portal).
- `p`: 1-indexed page. Omitted for page 1 (the bare URL already serves page 1).
- There is no browse-all/no-query listing endpoint — `/empleos` and
  `/ofertas-de-trabajo/` both 302-redirect to the homepage without a query
  slug. `--query` is required.
- A query with zero matches still returns HTTP 200 with an empty results
  list (verified with a nonsense query) — never a 404.

### El Salvador department names (→ URL slug, produced by `slugify()`)

| Department | Slug |
|---|---|
| San Salvador | `san-salvador` |
| La Libertad | `la-libertad` |
| San Miguel | `san-miguel` |
| Santa Ana | `santa-ana` |
| Sonsonate | `sonsonate` |
| La Paz | `la-paz` |
| Usulután | `usulutan` |
| Ahuachapán | `ahuachapan` |
| Chalatenango | `chalatenango` |
| Cuscatlán | `cuscatlan` |
| La Unión | `la-union` |
| San Vicente | `san-vicente` |
| Cabañas | `cabanas` |
| Morazán | `morazan` |
| Extranjero (abroad) | `extranjero` |

### Result heading (total count)

```html
<h1 class="title_page"><span class="fwB">1,227</span> Ofertas de trabajo de atencion al cliente</h1>
```

Thousands separator is a **comma** (unlike Jobindex's Danish dot-thousands) —
`parseTotalCount()` strips both `,` and `.` defensively.

### Job Card Extraction

Each result is an `<article class="box_offer" data-id='<32-char-hex-id>' ...>`.
The CLI splits the page on `<article class="box_offer` and parses each chunk
independently (one malformed card cannot break the rest):

| Field | Selector |
|---|---|
| id | `data-id='...'` attribute |
| title | `<a class="js-o-link fc_base" href="...">title</a>` (also the relative detail-page URL) |
| company | `<a class="fc_base t_ellipsis" href="..." offer-grid-article-company-url>name</a>` — **absent** for confidential postings, where the site shows placeholder text ("Importante empresa del sector") directly with no anchor. The CLI treats absence of the anchor as `company: null` rather than surfacing the placeholder text as if it were a real name. |
| location | `<p class="fs16 fc_base mt5"><span class="mr10">City, Department</span>` |
| salary | `<span class="icon i_salary"></span><value>` inside a `<div class="fs13 mt15">` — optional, many postings omit it |
| date | `<p class="fs13 fc_aux mt15">Hace N minutos/horas/días</p>` or `Hace más de 30 días` |

~20 results per page (not configurable via URL).

### Relative-time parsing

`Hace 49 minutos` / `Hace 1 hora` / `Hace 2 horas` / `Hace 2 días` parse into
an approximate ISO date (`now - offset`). `Hace más de 30 días` is
intentionally imprecise on the site itself (no exact count shown) and maps to
`null` rather than a fabricated cutoff.

### `--jobage` (client-side only)

`pubdate=` is robots.txt-disallowed, so `--jobage` never becomes a request
parameter. Instead the CLI filters the already-fetched page's own results
locally using the parsed relative-time `date` field. This narrows what's on
the fetched page — it does **not** fetch additional pages to backfill the
count, so a tight `--jobage` on an old query can return fewer than `--limit`
results even when more exist further back in the pagination.

## Detail

```
GET https://sv.computrabajo.com/ofertas-de-trabajo/{any-slug}-{id}
```

Verified live: the descriptive slug segment before the ID is cosmetic — any
non-empty filler text resolves the same page (`oferta-de-trabajo-de-x-<ID>`
works identically to the real slug). A bare ID with **no** filler segment
(`oferta-de-trabajo-<ID>` with nothing between `trabajo-` and the ID) 404s.
This lets `detail <id>` construct a working URL from just the bare ID
(`detailUrlFromId()` in `helpers.ts`), without needing to know the real slug.

### Fields (inside `<h1 class="fwB fs24 ...">` / the `div-link="oferta"` block)

| Field | Where |
|---|---|
| title | `<h1 class="fwB fs24 mb5 box_detail w100_m">` |
| company + location | `<p class="fs16">Company - City, Department</p>` immediately after the `</h1>` — split on the first `" - "`. When there's no dash the whole line is treated as `location` (`company: null`). |
| salary / contractType / employmentType | Up to three `<span class="tag base mb10">` inside `<div class="mbB">` — order is salary, contract type, employment type when all three are present; the CLI maps positionally by count (3/2/1 tags). |
| description | First `<p class="mbB">` in the `div-link="oferta"` block; `<br>` converted to newlines before tags are stripped |
| requirements | `<ul class="disc mbB">` list items following the "Requerimientos" label |
| keywords | `<p class="fc_aux fs13 mbB mtB">Palabras clave: a, b, c</p>` |
| updated date | `<p class="fc_aux fs13">` (no other classes) — **two possible shapes**, verified live: an absolute `"12 de agosto (actualizada)"` (Spanish long-form, no year — inferred as the current year unless that would be in the future, then the prior year) **or**, for very recent postings, the same relative-time phrasing as search cards (`"Hace 2 días (actualizada)"`). Both are parsed; the site itself decides which shape to render depending on recency. |
| apply URL | `data-href-offer-apply="..."` attribute on the "Postularme" button — points at `candidato.sv.computrabajo.com`, which requires a Computrabajo candidate account to actually complete |

### Quirk: a card's "Hace N minutos" freshness can disagree with the detail page's date

Boosted/"destacado" (promoted) listings can show a very fresh relative time on
the search card while the detail page's own "(actualizada)" date is older —
observed live on a promoted posting. This is a site behavior (promoted
listings get a freshness boost in the listing, independent of the content's
actual last-update date), not a parser bug. The two fields are recorded
honestly from their respective sources rather than reconciled.

## robots.txt vs Condiciones Legales

robots.txt technically permits the search/detail paths used here. The site's
`avisolegal` (Condiciones Legales) page separately and explicitly prohibits
automated/robot access in general terms — see SKILL.md. This mirrors
`linkedin-search`'s situation (technically reachable, ToS-prohibited): the
skill proceeds with a prominent personal-use-only warning rather than being
blocked outright, consistent with this repo's existing precedent.
