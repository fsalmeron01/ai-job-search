---
name: tecoloco-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in El Salvador,
  find Salvadoran job listings, look up a specific job posting on Tecoloco, or
  asks anything about the El Salvador job market — even if they don't mention
  tecoloco.com.sv explicitly. Invoke for open positions, vacancies, and hiring
  in San Salvador, Santa Ana, San Miguel, La Libertad, Soyapango, or anywhere
  else in El Salvador, across any sector (customer service, sales, banking,
  retail, logistics, admin, tech, etc.). Trigger phrases include: tecoloco,
  empleos el salvador, trabajo el salvador, bolsa de trabajo el salvador,
  vacantes el salvador, vacantes san salvador, ofertas de empleo el salvador,
  ofertas de trabajo, empleo en san salvador, trabajo en san miguel, buscar
  empleo, buscar trabajo, atención al cliente el salvador, jobs in el
  salvador, el salvador job search, job openings el salvador, hiring el
  salvador, job vacancies san salvador, work in san salvador, find a job in
  el salvador.
context: fork
enabled: false  # Salvadoran demo portal - ships opt-in; /setup enables it when your market is El Salvador, or set true here yourself
allowed-tools: Bash(bun run .agents/skills/tecoloco-search/cli/src/cli.ts *)
---

# Tecoloco Search Skill

Search live job listings from Tecoloco.com.sv — El Salvador's largest general job
board (part of the StepStone Group's Central America network). No authentication,
and **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Personal use only

`robots.txt` explicitly allows crawling `/empleos` and `/JobDesc.aspx` (`Content-Signal:
search=yes`), so this isn't blocked at the access-control layer. But Tecoloco's terms of
use (`tecoloco.com.sv/condiciones`, "Propiedad Intelectual") say site content "no puede
ser utilizado por ninguna persona o entidad para su duplicación, reproducción o difusión
... sin el consentimiento explícito de Tecoloco" — broad reproduction language that isn't
scraping-specific, but isn't nothing either. **Keep volume low, don't use this
commercially or for bulk data collection, and run it on your own responsibility.**

## When to use this skill

- Search for job openings anywhere in El Salvador by keyword, job title, or company
- Find jobs in a specific Salvadoran city (fold the city into `--query`, e.g. `cajero san miguel`)
- Get the full description, contract type, and publish/expiration dates for a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/tecoloco-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (job title, skill, or company). Recommended — include a city name here too, e.g. `"cajero san miguel"`; Tecoloco has no separate location parameter (the whole site is El Salvador-only).
- `--page <n>` — page number, 1-indexed.
- `--per-page <n>` — results per page: `40` (default), `80`, or `100`.
- `--limit <n>` / `-n <n>` — cap total results the CLI outputs (client-side).
- `--format json|table|plain` — default `json`.

> **No posting-age filter.** Tecoloco's search results carry no `--jobage`-style
> parameter and no posting date at all — only an expiration date ("Expira en"). Results
> are sorted most-recent-first by default. Use `detail` to read a listing's exact
> "Fecha de Publicación" if you need to know how fresh it is.

### Fetch full job detail

```bash
bun run .agents/skills/tecoloco-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `1102092`). You may also pass a
full `/<id>/<slug>.aspx` URL or a `JobDesc.aspx?ID=<id>` URL. Returns the full
description, contract type, experience level, publish date, expiration date, and the
(login-gated) apply link.

## Usage examples

```bash
# Customer service roles anywhere in El Salvador
bun run .agents/skills/tecoloco-search/cli/src/cli.ts search -q "atencion al cliente" --format table

# Accountant roles in San Salvador
bun run .agents/skills/tecoloco-search/cli/src/cli.ts search -q "contador san salvador" --limit 10 --format table

# Sales roles in Santa Ana, second page, larger page size
bun run .agents/skills/tecoloco-search/cli/src/cli.ts search -q "ventas santa ana" --per-page 80 --page 2 --format json

# Call center roles, top 5 by relevance
bun run .agents/skills/tecoloco-search/cli/src/cli.ts search -q "call center" --limit 5 --format table

# Warehouse/logistics roles in San Miguel
bun run .agents/skills/tecoloco-search/cli/src/cli.ts search -q "bodega logistica san miguel" --format table

# Full detail for a specific job
bun run .agents/skills/tecoloco-search/cli/src/cli.ts detail 1102092 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- Data is from Tecoloco.com.sv's public `/empleos` search-results page and
  `/JobDesc.aspx?ID=<id>` detail page — no credentials required.
- Page size defaults to 40 results; `--per-page` also accepts `80` or `100` (Tecoloco's
  own UI options).
- Tecoloco is El Salvador-only (the `.com.sv` TLD); there is no country/region
  parameter. Its sibling portals for other Central American markets (Guatemala,
  Costa Rica, etc.) use different domains and are not covered by this skill.
- `search` results carry `date: null` — Tecoloco's list view shows only an expiration
  countdown ("Expira en: DD/MM/YYYY"), not a posting date. `detail` returns both
  `publishedDate` and `expirationDate` (format `DD/MM/YYYY`, as published — not
  normalized to ISO 8601).
- Applying always routes through Tecoloco's own account-gated flow
  (`/Jobs/Aplicar/<id>`) — postings do not expose a direct external company apply link,
  so `detail`'s `applyUrl` requires a Tecoloco login to actually use.
- `detail` fetches by numeric ID via `JobDesc.aspx?ID=<id>`, not the `/<id>/<slug>.aspx`
  canonical URL search results link to — Tecoloco 404s that URL if the slug doesn't
  match exactly, but `JobDesc.aspx?ID=<id>` accepts the bare ID regardless of slug.
- Job IDs are numeric (e.g. `1102092`) — pass them as-is to `detail`.
