# adzuna-cli

CLI for searching **US** job listings via Adzuna's official public JSON REST API
(`api.adzuna.com`), across any sector.

**Data source**: Adzuna API `search` endpoint (`GET /v1/api/jobs/us/search/{page}`).
**Authentication**: Required - `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (free, instant signup, no
payment card: https://developer.adzuna.com/signup).
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Rate limits.** Adzuna's default API access limits: 25 hits/minute, 250 hits/day, 1000
> hits/week, 2500 hits/month. Every `search` or `detail` call counts as one hit. Keep volume low.

## Installation

```bash
cd .agents/skills/adzuna-search/cli
bun install   # optional — only installs TypeScript dev types
export ADZUNA_APP_ID="your-app-id"
export ADZUNA_APP_KEY="your-app-key"
```

The CLI runs without any install because it has zero runtime dependencies. It exits 1 with a
`MISSING_CREDENTIALS` JSON error on stderr if either environment variable is unset.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for US job listings |
| `detail` | Best-effort fetch of a listing's full text from its `url` (see below) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Project manager roles in Austin
bun run src/cli.ts search -q "project manager" -l "Austin, TX" --format table

# Software engineer roles in Chicago, posted in the last 7 days
bun run src/cli.ts search -q "software engineer" -l "Chicago" --jobage 7 --format table

# Marketing roles nationwide, newest first
bun run src/cli.ts search -q "marketing manager" --sort-by date --limit 10 --format table

# Full-text best-effort fetch for one listing
bun run src/cli.ts detail "https://www.adzuna.com/details/1234567890" --format plain
```

See `../SKILL.md` for the full flag reference, the two-variable credential setup, and the
`detail` deviation note (Adzuna's API has no lookup-by-id endpoint - `detail` requires the `url`
field from a `search` result, not a bare id).

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). |
| `--location` | `-l` | Place string, e.g. `"Austin, TX"`, `"Chicago"`, `"Remote"`. |
| `--jobage` | | Max posting age in days (Adzuna `max_days_old`). |
| `--page` | | 1-indexed page (Adzuna's own numbering). |
| `--limit` | `-n` | Cap results emitted; also bounds `results_per_page` (1-50). |
| `--category` | | Adzuna category tag, e.g. `it-jobs`. |
| `--sort-by` | | `default` \| `hybrid` \| `date` \| `salary` \| `relevance`. |
| `--salary-min` / `--salary-max` | | Salary range filter (USD). |
| `--exclude` | | Keywords to exclude (`what_exclude`). |
| `--full-time` / `--part-time` | | Employment-hours filter. |
| `--contract` / `--permanent` | | Employment-term filter. |
| `--format` | | `json` \| `table` \| `plain`. |
