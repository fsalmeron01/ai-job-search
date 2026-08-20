# tecoloco-cli

CLI for searching jobs on Tecoloco.com.sv, El Salvador's largest general job board,
across any sector.

**Data source**: Tecoloco's public `/empleos` search page and `/JobDesc.aspx?ID=<id>` detail page.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** `robots.txt` allows these paths, but Tecoloco's terms of use
> restrict reproduction of site content without consent. Keep volume low, don't use it
> commercially or for bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/tecoloco-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Customer service roles anywhere in El Salvador
bun run src/cli.ts search -q "atencion al cliente" --format table

# Accountant roles in San Salvador (fold the city into --query)
bun run src/cli.ts search -q "contador san salvador" --limit 10 --format table

# Larger page, page 2
bun run src/cli.ts search -q "ventas" --per-page 80 --page 2 --format json

# Full detail for one job
bun run src/cli.ts detail 1102092 --format plain
```

See `../SKILL.md` for the full flag reference and the terms-of-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / company). Recommended — include a city name too, e.g. `"cajero san miguel"`; there's no separate location parameter. |
| `--page` | | 1-indexed page. |
| `--per-page` | | `40` (default) \| `80` \| `100`. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

Tecoloco exposes no posting-age filter — there is intentionally no `--jobage` flag; see
`../SKILL.md` for how to check a listing's exact publish date via `detail`.

## Tests

```bash
bun test
```

Includes offline fixture-based parsing/validation tests plus a small live smoke test
(`tests/live-smoke.test.ts`) that hits the real site — keep that file's volume low if you
extend it.
