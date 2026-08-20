---
name: adzuna-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in the United States,
  find US job listings across any industry, or look up a specific job posting from
  Adzuna. Invoke for open positions, vacancies, and hiring across any sector or role
  (software, marketing, finance, healthcare, retail, operations, etc.) anywhere in
  the US. Trigger phrases: US jobs, jobs in America, jobs in the United States,
  adzuna, find a job in the US, American jobs, job openings in the US, hiring in the
  US, "software jobs in Austin", "marketing jobs in Chicago", "are there any X jobs
  in <US city>", nurse jobs Houston, accountant jobs Denver, sales jobs Miami,
  project manager jobs, remote jobs USA, entry level jobs, jobs near me (US),
  look up this Adzuna job posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/adzuna-search/cli/src/cli.ts *)
---

# Adzuna Search Skill

Search live US job listings via Adzuna's **official public JSON REST API** (`api.adzuna.com`) -
a general job-listing aggregator covering private-sector roles across every industry, not just
tech. This is **not** HTML scraping: every request is a plain, documented API call. **Zero
runtime dependencies** beyond `bun` and `fetch`.

> This closes the US-market gap in this repo's shipped portal skills (the Danish skills are
> Denmark-only; `linkedin-search` and `freehire-search` are global but tech-role-focused /
> require the user to already know exactly what they want).

## Setup (required before this skill works)

Adzuna's API requires **two** credentials - a deviation from this repo's usual
single-`<SERVICE>_API_TOKEN` convention, because Adzuna's API itself needs both:

1. Sign up **free** at **https://developer.adzuna.com/signup** - instant, self-serve, **no
   payment card required**.
2. Export both environment variables before running this skill:
   ```bash
   export ADZUNA_APP_ID="your-app-id"
   export ADZUNA_APP_KEY="your-app-key"
   ```
3. If either variable is unset, every command exits `1` immediately with
   `{ "error": "...", "code": "MISSING_CREDENTIALS" }` on stderr, naming exactly which
   variable(s) are missing. The CLI never falls through to an unauthenticated request.

**Rate limits** (Adzuna's default API access tier, per its Terms of Service): **25 hits/minute,
250 hits/day, 1000 hits/week, 2500 hits/month.** Every `search` or `detail` call is one hit -
keep volume low, especially while testing.

## When to use this skill

- Search for US job openings by keyword, job title, or skill, optionally narrowed to a city/state
- Filter by posting age, salary range, employment type (full/part-time, contract/permanent), or category
- Get a best-effort full-text read of one specific listing (see the Detail deviation note below)

## Commands

### Search job listings

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` - keyword search (job title, skill, role). e.g. `"project manager"`.
- `--location <text>` / `-l <text>` - place string, e.g. `"Austin, TX"`, `"Chicago"`. Optional -
  omit for a nationwide search.
- `--jobage <days>` - only postings at most N days old (Adzuna's `max_days_old`). Omit for all.
- `--page <n>` - page number (1-indexed, matches Adzuna's own numbering).
- `--limit <n>` / `-n <n>` - cap results emitted; also bounds how many are requested per page (1-50).
- `--category <tag>` - Adzuna category tag, e.g. `it-jobs`, `sales-jobs`, `healthcare-nursing-jobs`.
- `--sort-by <order>` - `default` | `hybrid` | `date` | `salary` | `relevance`.
- `--salary-min <n>` / `--salary-max <n>` - salary range filter (USD).
- `--exclude <text>` - keywords to exclude.
- `--full-time` / `--part-time` - employment-hours filter.
- `--contract` / `--permanent` - employment-term filter.
- `--format json|table|plain` - default `json`.

### Fetch a listing's full text (deviation from the base contract - read this)

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts detail <url> [--format json|plain]
```

**Adzuna's API has no endpoint to look up a single job by id** - confirmed against its live
OpenAPI spec, which lists only `search`, `categories`, `histogram`, `top_companies`, `geodata`,
`history`, and `version`. So unlike this repo's other portal skills, `detail` here does **not**
accept a bare id - it requires the **`url` field from a `search` result** (Adzuna's
`redirect_url`, the same link a human would click "Apply" through). Passing a bare id returns a
clear `NO_DETAIL_ENDPOINT` error instead of guessing.

`detail` fetches that URL directly - a plain GET against whatever third-party employer/ATS site
the ad actually lives on, **not** a second Adzuna API call, so it needs no credentials. Because
that destination varies by advertiser, extraction is generic best-effort (page title + meta
description, falling back to visible body text), not a structured per-site parser. `search`
results already include Adzuna's own snippet-length `description` (Adzuna documents this as
truncated); `detail` is how to get more of the text when the snippet isn't enough - full
reliability is not guaranteed. See `url-reference.md` for the full investigation.

## Usage examples

```bash
# Project manager roles in Austin
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "project manager" -l "Austin, TX" --format table

# Software engineer roles in Chicago, posted in the last 7 days
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "software engineer" -l "Chicago" --jobage 7 --format table

# Marketing roles nationwide, newest first, top 10
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "marketing manager" --sort-by date --limit 10 --format table

# Nurse jobs in Houston paying at least $70k, full-time only
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "nurse" -l "Houston, TX" --salary-min 70000 --full-time --format table

# Sales jobs in Miami, IT category excluded from a broader query
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "sales" -l "Miami, FL" --exclude "software" --format table

# Full text for a specific result (pass its "url" field, not an id)
bun run .agents/skills/adzuna-search/cli/src/cli.ts detail "https://www.adzuna.com/details/1234567890" --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing `url` to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's best-effort full text (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source: Adzuna's official public API (`api.adzuna.com`) - documented, not scraped. See
  `url-reference.md` for the full endpoint/parameter/response reference and the access-legitimacy
  check (Adzuna's Terms of Service explicitly permit "Personal research" use).
- Scoped to the US market (`country=us`); Adzuna covers other countries too, but this skill
  hardcodes `us` since that's the gap it's meant to close in this repo.
- No native "remote" filter exists in Adzuna's API - include "remote" as a keyword in `--query` if useful.
- `--location` uses Adzuna's default 5km search radius server-side; there is no `--distance` flag.
- Search result `description` fields are Adzuna's own truncated snippet (~500 characters), not
  the full posting - use `detail <url>` for more text, with the caveat above.
- Salary fields are only present when Adzuna has salary data for a posting (frequently
  employer-estimated / `salaryIsPredicted: true`) - absent salary is `null`, never fabricated.
