---
name: computrabajo-sv-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in El Salvador,
  find Salvadoran job listings, look up a specific job posting on Computrabajo,
  or asks anything about the El Salvador job market — even if they don't
  mention Computrabajo explicitly. Invoke for open positions, vacantes,
  ofertas de empleo, hiring in El Salvador, or job opportunities in Salvadoran
  cities/departments (San Salvador, Santa Ana, San Miguel, La Libertad, etc.).
  Trigger phrases: empleos el salvador, trabajo el salvador, bolsa de trabajo,
  bolsa de empleo el salvador, vacantes san salvador, vacantes el salvador,
  ofertas de empleo el salvador, ofertas de trabajo el salvador, computrabajo,
  computrabajo el salvador, trabajo en san salvador, empleo santa ana, empleo
  san miguel, jobs el salvador, job vacancy el salvador, salvadoran jobs, jobs
  in san salvador, job search el salvador, work in el salvador, find work el
  salvador, hiring el salvador, job openings el salvador, job listings el
  salvador, atencion al cliente el salvador, ventas el salvador, contador el
  salvador.
context: fork
enabled: false  # market-specific portal - ships opt-in; enable when your target market is El Salvador
allowed-tools: Bash(bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts *)
---

# Computrabajo El Salvador Search Skill

Search live Salvadoran job listings from Computrabajo (`sv.computrabajo.com` — the
canonical host behind `www.computrabajo.com.sv`). No authentication needed. Covers
thousands of postings across all sectors, updated in real time.

## ⚠️ Personal use only

Computrabajo's own **Condiciones Legales** (`https://sv.computrabajo.com/avisolegal/`)
explicitly prohibit this kind of access, in two places:

> "No utilizar mecanismos, software o scripts en relación con la utilización del Sitio
> Web... el copiado mediante tecnologías de buscador tipo 'Robot/Crawler' no es
> necesario para la correcta utilización de los servicios, por lo que queda prohibido
> expresamente."
>
> "Acceder a los servicios o cualquier información publicada en este sitio web de forma
> personal e interactiva. El acceso o lectura mediante robots o programas automáticos
> no está permitido."

`robots.txt` itself does **not** disallow the search/detail paths this skill uses (see
`url-reference.md`) and no login is required to view listings — but the site's own
Terms explicitly ban automated/robot access regardless. This mirrors `linkedin-search`'s
situation in this repo (technically reachable, ToS-prohibited), so — consistent with
that precedent — this skill proceeds but **keep volume low, never use it commercially
or for bulk data collection, and run it on your own responsibility.**

## When to use this skill

- Search for job openings in El Salvador by keyword, job title, or profession
- Filter jobs by department (San Salvador, La Libertad, Santa Ana, San Miguel, etc.)
- Filter by recency, approximately (see the `--jobage` note below)
- Get the full description, requirements, and salary of a specific job listing
- Explore the Salvadoran job market for a given profession or skill set

## Commands

### Search job listings

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keyword search (job title, skill, role).
  Computrabajo has no browse-all listing without a query.
- `--location <text>` / `-l <text>` — an El Salvador department: San Salvador, La
  Libertad, San Miguel, Santa Ana, Sonsonate, La Paz, Usulután, Ahuachapán,
  Chalatenango, Cuscatlán, La Unión, San Vicente, Cabañas, Morazán, or Extranjero
  (abroad). Filtering is department-level only — for a specific city, fold it into
  `--query` instead (e.g. `--query "cajero santa tecla"`).
- `--jobage <days>` — approximate posting-age filter, applied **client-side** to the
  fetched page (Computrabajo's server-side date filter is robots.txt-disallowed — see
  Notes). This narrows what's already on the page; it does not fetch extra pages.
- `--page <n>` — page number (1-indexed, ~20 results per page).
- `--limit <n>` / `-n <n>` — cap total results the CLI outputs (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job ID from `search` results (32-char hex, e.g.
`6A0546EA7AB8C14061373E686DCF3405`). You may also pass the full Computrabajo URL.
Returns the full description, requirements, salary, contract type, employment type,
and apply link.

---

## Usage examples

### Customer-service roles in San Salvador

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts search \
  --query "atencion al cliente" \
  --location "San Salvador" \
  --format table
```

### Software developer roles, last 7 days

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts search \
  --query "desarrollador de software" \
  --jobage 7 \
  --format table
```

### Accountant roles in Santa Ana

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts search \
  --query "contador" \
  --location "Santa Ana" \
  --format table
```

### Sales roles, page 2

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts search \
  --query "ventas" \
  --page 2 \
  --format json
```

### Warehouse/logistics roles, all departments

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts search \
  --query "bodega logistica" \
  --limit 10 \
  --format table
```

### Full details for a specific job

```bash
bun run .agents/skills/computrabajo-sv-search/cli/src/cli.ts detail 6A0546EA7AB8C14061373E686DCF3405 --format plain
```

---

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- Data is Computrabajo's public server-rendered search and detail pages — no JSON API
  was found; the CLI parses HTML with regex, chunked per result card. No credentials
  required.
- `--query` is required — there is no query-less "browse all" listing on this portal.
- Location filtering is department-level (14 departments + "Extranjero"); city-level
  filtering isn't URL-addressable, so fold a city name into `--query` instead (same
  limitation `jobindex-search` documents for its portal's area filtering).
- `--jobage` is a **client-side approximation**, not a server request parameter —
  Computrabajo's `pubdate=` filter is disallowed by `robots.txt`, so this CLI never
  sends it. Instead it drops results whose parsed relative-time date falls outside the
  window, from whatever page was already fetched.
- ~20 results per page (fixed by the site, not configurable).
- Some postings hide the employer ("Importante empresa del sector" placeholder instead
  of a real name) — the CLI reports `company: null` for these rather than surfacing the
  placeholder text as if it were a real company.
- Job IDs are 32-character hex strings (e.g. `6A0546EA7AB8C14061373E686DCF3405`) — pass
  them as-is to `detail`.
- See `url-reference.md` for the full endpoint reference, department-slug table, and
  parsing quirks (including a promoted-listing freshness quirk worth knowing about).
