import { bodyText, htmlFetch, metaContent, titleTag, writeError } from "../helpers.js"

// ---------------------------------------------------------------------------
// Deviation from the base portal-skill contract, documented in SKILL.md:
//
// Adzuna's public API (confirmed against its live OpenAPI spec at
// https://developer.adzuna.com/swagger/spec/test2.json) exposes NO endpoint to
// re-fetch a single advertisement by id. The only per-job identifiers in a
// `search` response are `id` (opaque, not queryable) and `redirect_url` (a
// link to the posting on the advertiser's/job board's own site - fetching it
// is literally what a human clicking "Apply" would do). Adzuna's own docs
// note that `search` already returns "a snipped of the job description" -
// there is no documented way to get the untruncated text except by following
// redirect_url.
//
// So `detail` here only works with a URL (the `url` field from a `search`
// result). Given a bare id, it fails loudly with a clear explanation instead
// of guessing or silently hitting Adzuna's API a second time with a
// parameter it doesn't support.
//
// A URL fetch is a plain GET against whatever third-party site the ad lives
// on, not a call to Adzuna's API - no ADZUNA_APP_ID/ADZUNA_APP_KEY needed for
// this path. Because redirect_url can point at any of thousands of different
// employer/ATS sites, extraction is generic best-effort (og:title/<title>,
// og:description/meta description, falling back to visible body text) rather
// than a structured per-site parser - this is explicitly weaker than the
// other portal skills' `detail`, and SKILL.md says so.
// ---------------------------------------------------------------------------

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export interface DetailResult {
  id: null
  title: string
  company: null
  location: null
  date: null
  url: string
  description: string | null
}

function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  if (!isUrl(opts.id)) {
    writeError(
      `Adzuna's API has no endpoint to look up a single job by id ("${opts.id}") - only \`search\` exists. ` +
        `Run \`search\` and pass the result's "url" field (its redirect_url) to \`detail\` instead, ` +
        `e.g. detail "https://www.adzuna.com/details/...".`,
      "NO_DETAIL_ENDPOINT",
    )
    return 1
  }

  try {
    const html = await htmlFetch(opts.id)
    if (!html) {
      writeError("Listing page not found (404)", "NOT_FOUND")
      return 1
    }

    const title = metaContent(html, "og:title") ?? titleTag(html) ?? "(untitled)"
    let description = metaContent(html, "og:description") ?? metaContent(html, "description")
    if (!description || description.length < 100) {
      const body = bodyText(html)
      if (body && (!description || body.length > description.length)) description = body
    }

    const result: DetailResult = {
      id: null,
      title,
      company: null,
      location: null,
      date: null,
      url: opts.id,
      description: description || null,
    }

    if (opts.format === "plain") {
      const lines = [
        result.title,
        "",
        result.description || "(no description extracted)",
        "",
        `URL: ${result.url}`,
        "",
        "Note: fetched directly from the advertiser's site (Adzuna has no per-job API endpoint); fields other than title/description/url are not available from this source.",
      ]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
