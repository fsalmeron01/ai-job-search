# computrabajo-sv-cli

CLI for searching jobs on Computrabajo El Salvador's public job listings, across any
sector.

**Data source**: `sv.computrabajo.com` server-rendered search (`/trabajo-de-<slug>`)
and detail (`/ofertas-de-trabajo/<slug>-<id>`) pages. No JSON API was found — parsed
with regex, chunked per result card.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **Personal use only.** Computrabajo's Condiciones Legales (`/avisolegal/`) explicitly
> prohibit automated/robot access to the site. Keep volume low, don't use it
> commercially or for bulk data collection, and run it on your own responsibility. See
> `../SKILL.md` for the exact clauses.

## Installation

```bash
cd .agents/skills/computrabajo-sv-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts
`--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Customer service roles in San Salvador
bun run src/cli.ts search -q "atencion al cliente" -l "San Salvador" --format table

# Software developer roles, last 7 days
bun run src/cli.ts search -q "desarrollador de software" --jobage 7 --format table

# Full detail for one job
bun run src/cli.ts detail 6A0546EA7AB8C14061373E686DCF3405 --format plain
```

See `../SKILL.md` for the full flag reference and the Condiciones Legales note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / role). |
| `--location` | `-l` | An El Salvador department, e.g. `"San Salvador"`, `"Santa Ana"`. Department-level only. |
| `--jobage` | | Client-side posting-age filter in days (see `../SKILL.md` Notes — not a server parameter). |
| `--page` | | 1-indexed page (~20 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun test
```

`tests/parsing.test.ts`, `tests/retry-backoff.test.ts`, and
`tests/request-timeout.test.ts` are offline fixture/mock tests (CI runs these).
`tests/cli-flag-validation.test.ts` spawns the CLI but makes no network calls.
`tests/search.test.ts` is a **live** smoke test against the real portal (search +
detail, low volume) — run it locally, not in CI (see the repo's `.github/workflows/ci.yml`
comment on why live portal tests are deliberately excluded from CI).
