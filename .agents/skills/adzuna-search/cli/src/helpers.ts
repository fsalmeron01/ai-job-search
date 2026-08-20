// Data source: Adzuna's official public JSON REST API (api.adzuna.com), documented at
// https://developer.adzuna.com/docs/search. This is NOT HTML scraping - every request
// is a plain JSON GET against a documented endpoint. Adzuna's Terms of Service
// (https://developer.adzuna.com/docs/terms_of_service) explicitly list "Personal
// research" as a permissible use, and default API access limits are:
//   25 hits/minute, 250 hits/day, 1000 hits/week, 2500 hits/month.
// Every request costs one hit against those limits - keep volume low.
//
// This skill is scoped to the US job market (country code "us" in Adzuna's API).

export const API_BASE = "https://api.adzuna.com/v1/api"
export const COUNTRY = "us"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Credentials read only from the environment - never accepted as a CLI flag. */
export interface Credentials {
  appId: string
  appKey: string
}

/**
 * Reads ADZUNA_APP_ID / ADZUNA_APP_KEY from the environment. Adzuna's API needs
 * TWO values (app_id and app_key), unlike the single-token <SERVICE>_API_TOKEN
 * convention used elsewhere in this repo's portal-skill contract - documented as
 * a deliberate deviation in SKILL.md. Returns null and writes the standard
 * MISSING_CREDENTIALS stderr error (naming exactly which variable(s) are unset)
 * if either is missing, so callers never fall through to an unauthenticated
 * request against Adzuna's API.
 */
export function getCredentials(): Credentials | null {
  const appId = (process.env.ADZUNA_APP_ID ?? "").trim()
  const appKey = (process.env.ADZUNA_APP_KEY ?? "").trim()
  const missing: string[] = []
  if (!appId) missing.push("ADZUNA_APP_ID")
  if (!appKey) missing.push("ADZUNA_APP_KEY")
  if (missing.length > 0) {
    writeError(
      `Missing required environment variable(s): ${missing.join(", ")}. Adzuna's API requires both an app_id and an app_key. Sign up for free at https://developer.adzuna.com/signup, then export ${missing.join(" and ")} before running this command.`,
      "MISSING_CREDENTIALS",
    )
    return null
  }
  return { appId, appKey }
}

const UA = "Mozilla/5.0 (compatible; adzuna-search-cli/1.0)"

/**
 * Fetch JSON with exponential backoff on 429/5xx (max 6 retries). Returns null
 * on a 404 rather than throwing, per the portal-skill contract. Adzuna returns
 * a 410 for bad app_id/app_key ("Authorisation failed" per its OpenAPI spec) -
 * surfaced as a thrown error so the caller can report it distinctly from a
 * generic request failure.
 */
export async function apiFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Adzuna API request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (response.status === 410) {
      throw new Error(
        "Adzuna rejected the app_id/app_key (410 Authorisation failed) - double-check ADZUNA_APP_ID and ADZUNA_APP_KEY",
      )
    }
    if (!response.ok) {
      throw new Error(`Adzuna API request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Adzuna API request failed after max retries")
}

/**
 * Fetch a raw listing URL (e.g. the redirect_url a search result points to) as
 * HTML. Used only by `detail <url>` - this is a generic fetch of whatever
 * third-party site Adzuna's redirect_url resolves to, not a call to Adzuna's
 * API, so it needs no credentials.
 */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---- Adzuna's raw response shapes (per its OpenAPI spec, components.schemas.Job) ----

export interface AdzunaCategory {
  tag?: string
  label?: string
}

export interface AdzunaCompany {
  display_name?: string
  canonical_name?: string
}

export interface AdzunaLocation {
  display_name?: string
  area?: string[]
}

export interface AdzunaJob {
  id?: string
  title?: string
  description?: string
  created?: string
  redirect_url?: string
  adref?: string
  latitude?: number
  longitude?: number
  location?: AdzunaLocation
  category?: AdzunaCategory
  company?: AdzunaCompany
  salary_min?: number
  salary_max?: number
  salary_is_predicted?: string
  contract_time?: string
  contract_type?: string
}

export interface AdzunaSearchResponse {
  count?: number
  mean?: number
  results?: AdzunaJob[]
}

/** Normalized shape honoring the portal-skill contract's minimum result fields. */
export interface JobResult {
  id: string | null
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  description: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryIsPredicted: boolean | null
  category: string | null
  contractType: string | null
  contractTime: string | null
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Adzuna's `description` field carries inline <strong> highlight tags around matched keywords. */
function cleanDescription(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = decodeHtmlEntities(stripTags(raw))
  return cleaned || null
}

/** Normalize one raw Adzuna job into the portal-skill contract's result shape. */
export function normalizeJob(raw: AdzunaJob): JobResult {
  return {
    id: raw.id ?? null,
    title: raw.title ? decodeHtmlEntities(stripTags(raw.title)) : "(untitled)",
    company: raw.company?.display_name ?? null,
    location: raw.location?.display_name ?? null,
    date: raw.created ?? null,
    url: raw.redirect_url ?? "",
    description: cleanDescription(raw.description),
    salaryMin: typeof raw.salary_min === "number" ? raw.salary_min : null,
    salaryMax: typeof raw.salary_max === "number" ? raw.salary_max : null,
    salaryIsPredicted:
      raw.salary_is_predicted === undefined ? null : raw.salary_is_predicted === "1",
    category: raw.category?.label ?? null,
    contractType: raw.contract_type ?? null,
    contractTime: raw.contract_time ?? null,
  }
}

/** Binary Adzuna query flags (e.g. full_time=1) - present means "1", absent means omitted. */
export function binaryFlag(present: boolean | undefined): "1" | undefined {
  return present ? "1" : undefined
}

// ---- Generic best-effort extraction for `detail <url>` (see commands/detail.ts) ----

export function metaContent(html: string, matcher: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)="${matcher}"[^>]+content="([^"]*)"|<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${matcher}"`,
    "i",
  )
  const m = html.match(re)
  const value = m ? (m[1] ?? m[2]) : null
  return value ? decodeHtmlEntities(value).trim() || null : null
}

export function titleTag(html: string): string | null {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i)
  return m ? decodeHtmlEntities(stripTags(m[1])).trim() || null : null
}

function visibleHtml(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
}

export function bodyText(html: string): string | null {
  const text = decodeHtmlEntities(
    stripTags(visibleHtml(html).replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, "\n")),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
  return text || null
}
