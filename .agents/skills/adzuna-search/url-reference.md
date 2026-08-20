# Adzuna API Reference

Official public JSON REST API. This skill is **not** HTML scraping - every request is a plain
GET against a documented endpoint. Confirmed live against Adzuna's own docs and its published
OpenAPI 3.1 spec on 2026-08-20.

- Docs home: https://developer.adzuna.com
- Search docs (human-readable, with worked examples): https://developer.adzuna.com/docs/search
- Interactive/full parameter reference: https://developer.adzuna.com/activedocs
- Machine-readable OpenAPI spec: https://developer.adzuna.com/swagger/spec/test2.json
- Terms of Service: https://developer.adzuna.com/docs/terms_of_service
- Sign up (free, instant, no card): https://developer.adzuna.com/signup

## Access legitimacy (Step 2.4)

- `developer.adzuna.com/robots.txt` has no `Disallow` rules - the docs/signup pages are fully
  crawlable (this only matters for reading the docs; the API itself doesn't use robots.txt).
- Terms of Service, **Permissible Use** section, explicitly lists **"Personal research"** as an
  allowed use of the API, alongside publishing Adzuna listings and Jobsworth salary estimates.
  This skill's use (searching for a job on the user's own behalf) is squarely personal research.
- **Default API access limits** (Terms of Service, "Default API access limits"): **25 hits/minute,
  250 hits/day, 1000 hits/week, 2500 hits/month.** Every `search` or `detail` call is one hit.
  Higher limits require contacting Adzuna directly (commercial publishing use case) - not needed
  here.
- No login/authentication wall blocks reading the docs; the API itself requires the app_id/app_key
  credential pair described below (this is the intended, documented way to use it - not a
  workaround).

## Search

```
GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
```

This skill hardcodes `{country}` = `us` (the market it targets). Adzuna also supports `gb`, `at`,
`au`, `be`, `br`, `ca`, `ch`, `de`, `es`, `fr`, `in`, `it`, `mx`, `nl`, `nz`, `pl`, `sg`, `za` -
out of scope for this skill.

`{page}` is a 1-indexed path segment (`/search/1`, `/search/2`, ...) - the CLI's `--page` flag
maps directly onto it, no offset arithmetic needed.

### Query parameters used by this CLI

| Param | CLI flag | Meaning |
|-------|----------|---------|
| `app_id` | (env `ADZUNA_APP_ID`) | Required. Application ID. |
| `app_key` | (env `ADZUNA_APP_KEY`) | Required. Application key. |
| `results_per_page` | derived from `--limit` (clamped 1-50) | Results per page. |
| `what` | `--query` / `-q` | Free-text keywords. |
| `what_exclude` | `--exclude` | Keywords to exclude. |
| `where` | `--location` / `-l` | Place string (city, region, "Remote" is not a native Adzuna concept - see Notes). |
| `max_days_old` | `--jobage` | Oldest posting age, in days, to include. |
| `category` | `--category` | Category tag (see Categories below). |
| `sort_by` | `--sort-by` | `default` \| `hybrid` \| `date` \| `salary` \| `relevance`. |
| `salary_min` / `salary_max` | `--salary-min` / `--salary-max` | Salary range filter. |
| `full_time` / `part_time` | `--full-time` / `--part-time` | Binary flags (`1` when set). |
| `contract` / `permanent` | `--contract` / `--permanent` | Binary flags (`1` when set). |
| `content-type` | (always `application/json`) | Forces JSON response. |

Documented but **not** exposed by this CLI (kept out to match the base portal-skill contract's
flag surface; add later if needed): `what_and`, `what_phrase`, `what_or`, `title_only`,
`distance`, `location0`-`location7`, `salary_include_unknown`, `company`, `sort_dir`.

### Response shape (`JobSearchResults`)

```json
{
  "count": 18432,
  "mean": 87000.5,
  "results": [
    {
      "id": "129698749",
      "title": "Javascript Developer",
      "description": "JavaScript Developer Corporate ... (truncated to ~500 chars)",
      "created": "2013-11-08T18:07:39Z",
      "redirect_url": "https://www.adzuna.com/details/129698749",
      "adref": "opaque-token",
      "latitude": 51.571999,
      "longitude": -0.776902,
      "location": { "display_name": "Marlow, Buckinghamshire", "area": ["UK", "..."] },
      "category": { "label": "IT Jobs", "tag": "it-jobs" },
      "company": { "display_name": "Corporate Project Solutions" },
      "salary_min": 50000,
      "salary_max": 55000,
      "salary_is_predicted": "0",
      "contract_time": "full_time",
      "contract_type": "permanent"
    }
  ]
}
```

`count` maps to this skill's `meta.count`. `description` is explicitly documented as truncated
("we currently only provide a snipped of the job description in the response") - see Detail below
for what this means for full-text retrieval.

## Categories (used by `--category`)

```
GET https://api.adzuna.com/v1/api/jobs/us/categories?app_id=...&app_key=...
```

Returns `{ "results": [ { "label": "IT Jobs", "tag": "it-jobs" }, ... ] }`. Not wrapped by this
CLI - pass a known tag (e.g. `it-jobs`, `sales-jobs`, `accounting-finance-jobs`) directly to
`--category`, or fetch this endpoint manually to see the full current list.

## Detail - no per-job lookup endpoint (important deviation)

Adzuna's OpenAPI spec (`swagger/spec/test2.json`, fetched live) lists exactly seven paths:
`/jobs/{country}/search/{page}`, `/jobs/{country}/categories`, `/jobs/{country}/histogram`,
`/jobs/{country}/top_companies`, `/jobs/{country}/geodata`, `/jobs/{country}/history`, and
`/version`. **There is no endpoint to re-fetch a single advertisement by id.** The `Job` schema's
`adref` field is documented as "may be used with the 'ad' endpoint to re-retrieve this
advertisement in the future" - but no such `ad` endpoint exists anywhere in the current spec or
docs sidebar (checked `/docs/search`, `/activedocs`, and the docs navigation menu). This looks
like a vestige of an older API version; it is not something this CLI can reliably call.

**Consequence for this skill's `detail` command:** it does not take a bare Adzuna `id`. It takes
the `url` field from a `search` result (Adzuna's `redirect_url` - the same link a human would
click "Apply" through) and fetches that page directly - a generic HTTP GET against whatever
third-party employer/ATS site the ad lives on, not a second call to Adzuna's API. Extraction is
best-effort generic (`og:title`/`<title>`, `og:description`/meta description, falling back to
visible body text) because redirect_url can point at thousands of differently-structured sites -
there is no single markup pattern to anchor on the way there is for a single-portal HTML scrape.
Passing a bare id returns a clear `NO_DETAIL_ENDPOINT` error explaining this instead of silently
failing or guessing.

## Credentials

Sign up free at https://developer.adzuna.com/signup - instant, no payment card. Provides an
`app_id` and `app_key` pair. This CLI reads them **only** from `ADZUNA_APP_ID` /
`ADZUNA_APP_KEY` environment variables (never a CLI flag, never committed to the repo).

## Notes / quirks

- No native "remote" filter - Adzuna's `where`/location params are geographic place strings, not
  a workplace-type facet. Include "remote" as a keyword in `--query` if useful (results vary).
- `distance` defaults to 5km around `where` server-side when `where` is set; this CLI doesn't
  expose `--distance`, so a `--location` search uses Adzuna's 5km default radius.
- `salary_is_predicted` is documented as `"0"`/`"1"` (a string), not a boolean - normalized to a
  real boolean in this CLI's output.
- Adzuna returns HTTP 410 ("Authorisation failed") for a bad `app_id`/`app_key` pair, not 401/403
  - the CLI surfaces this as a distinct, readable error message.
