import {
  API_BASE,
  COUNTRY,
  apiFetch,
  binaryFlag,
  getCredentials,
  normalizeJob,
  writeError,
  type AdzunaSearchResponse,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number // maps to max_days_old
  page: number
  limit?: number
  format: "json" | "table" | "plain"
  // Adzuna-specific extensions beyond the base portal-skill contract:
  category?: string
  sortBy?: string // "default" | "hybrid" | "date" | "salary" | "relevance"
  salaryMin?: number
  salaryMax?: number
  fullTime?: boolean
  partTime?: boolean
  contract?: boolean
  permanent?: boolean
  exclude?: string // what_exclude
}

function buildUrl(opts: SearchOpts, appId: string, appKey: string): string {
  const params = new URLSearchParams()
  params.set("app_id", appId)
  params.set("app_key", appKey)
  params.set("content-type", "application/json")
  // Request only as many results as we'll actually emit (bounded 1-50, Adzuna's
  // practical per-page ceiling) - this also keeps us economical against the
  // account's daily/weekly/monthly hit quota.
  const perPage = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  params.set("results_per_page", String(perPage))
  if (opts.query) params.set("what", opts.query)
  if (opts.location) params.set("where", opts.location)
  if (opts.jobage !== undefined && opts.jobage > 0 && opts.jobage < 9999) {
    params.set("max_days_old", String(opts.jobage))
  }
  if (opts.category) params.set("category", opts.category)
  if (opts.sortBy) params.set("sort_by", opts.sortBy)
  if (opts.salaryMin !== undefined) params.set("salary_min", String(opts.salaryMin))
  if (opts.salaryMax !== undefined) params.set("salary_max", String(opts.salaryMax))
  if (opts.exclude) params.set("what_exclude", opts.exclude)
  const fullTime = binaryFlag(opts.fullTime)
  if (fullTime) params.set("full_time", fullTime)
  const partTime = binaryFlag(opts.partTime)
  if (partTime) params.set("part_time", partTime)
  const contract = binaryFlag(opts.contract)
  if (contract) params.set("contract", contract)
  const permanent = binaryFlag(opts.permanent)
  if (permanent) params.set("permanent", permanent)

  return `${API_BASE}/jobs/${COUNTRY}/search/${opts.page}?${params.toString()}`
}

function renderTable(results: JobResult[]): string {
  if (results.length === 0) return "No results."
  const rows = results.map((r) => {
    const id = (r.id ?? "—").padEnd(11)
    const title = (r.title || "").slice(0, 42).padEnd(42)
    const company = (r.company || "—").slice(0, 26).padEnd(26)
    const loc = (r.location || "—").slice(0, 24).padEnd(24)
    const date = (r.date || "—").slice(0, 10)
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(24) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(results: JobResult[]): string {
  return results
    .map((r) => {
      const salary =
        r.salaryMin || r.salaryMax
          ? `$${r.salaryMin ?? "?"}–$${r.salaryMax ?? "?"}${r.salaryIsPredicted ? " (est.)" : ""}`
          : "—"
      return `${r.title}\n  ${r.company || "—"} · ${r.location || "—"} · ${r.date || "—"} · ${salary}\n  id: ${r.id ?? "—"}\n  ${r.url}`
    })
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const creds = getCredentials()
  if (!creds) return 1 // getCredentials already wrote the MISSING_CREDENTIALS stderr error

  try {
    const data = await apiFetch<AdzunaSearchResponse>(buildUrl(opts, creds.appId, creds.appKey))
    let results = (data?.results ?? []).map(normalizeJob)
    if (opts.limit !== undefined && opts.limit >= 0) results = results.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write((renderPlain(results) || "No results.") + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: data?.count ?? results.length, page: opts.page }, results },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
