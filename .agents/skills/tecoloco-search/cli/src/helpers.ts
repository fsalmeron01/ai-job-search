// Data source: Tecoloco.com.sv's public /empleos search-results page and
// JobDesc.aspx?ID=<id> detail page (El Salvador's largest general job board).
// No authentication required. Both are HTML pages parsed with chunked regex
// (the markup is shallow and stable; a full DOM parser is unnecessary).
//
// robots.txt (checked 2026-08-20) allows `User-agent: *` on `/empleos` and
// `/JobDesc.aspx`, and its Content-Signal line reads `search=yes` (building a
// search index / returning results is permitted). Personal use only, though:
// tecoloco.com.sv/condiciones ("Propiedad Intelectual") says site content
// "no puede ser utilizado por ninguna persona o entidad para su duplicación,
// reproducción o difusión ... sin el consentimiento explícito de Tecoloco" —
// broad reproduction language that is not scraping-specific but is not
// nothing either. Keep volume low, no commercial or bulk use (see SKILL.md).

export const SEARCH_URL = "https://www.tecoloco.com.sv/empleos"
export const DETAIL_URL = "https://www.tecoloco.com.sv/JobDesc.aspx"
export const SITE_ORIGIN = "https://www.tecoloco.com.sv"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; tecoloco-search-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-SV,es;q=0.9,en;q=0.8",
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

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  experienceLevel: string | null
  publishedDate: string | null
  expirationDate: string | null
  applyUrl: string | null
}

/**
 * Extract the inner HTML of a <div> identified by a CSS class name, correctly
 * handling nested <div> elements by tracking tag depth.
 */
export function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

// Decode entities (notably &nbsp;, which becomes a literal space) BEFORE
// stripping tags, so the whitespace collapse in stripTags absorbs the
// decoded space too — decoding after collapsing left doubled spaces like
// "San Salvador,&nbsp;<span>" -> "San Salvador,  El Salvador".
function clean(html: string): string {
  return stripTags(decodeHtmlEntities(html))
}

/**
 * Like `clean`, but for multi-paragraph blocks: converts <br> and the close
 * tags of block elements (p/li/ul/ol/div/h1-6) into line breaks in the
 * output. A literal "\n" inserted before tag-stripping would not survive —
 * `\s` treats newlines as ordinary whitespace, so `stripTags`'s whitespace
 * collapse folds them into the surrounding spaces and silently flattens
 * every description to one line. Instead each break is marked with a
 * placeholder outside `\s` (U+E000, Private Use Area — never appears in real
 * job-posting text) that survives tag-stripping and entity decoding, and is
 * only split on at the very end.
 */
function htmlBlockToText(html: string): string {
  const BREAK = ""
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, BREAK)
    .replace(/<\/(p|li|ul|ol|div|h[1-6])>/gi, BREAK)
  const stripped = decodeHtmlEntities(withBreaks).replace(/<[^>]+>/g, " ")
  return stripped
    .split(BREAK)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
}

/**
 * Parse the search-results page. Each job renders twice — once as a
 * `.job-card` (desktop) and once as a `.job-card-mobile` block — CSS toggles
 * which is visible, both are always present in the markup. We parse only the
 * mobile variant so each job is counted once, and because its location span
 * includes the city (e.g. "San Salvador, El Salvador") where the desktop
 * variant sometimes shows only the country. Chunks split on the mobile-card
 * open tag so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<div class="job-card-mobile">/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-job-id="(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    const shareMatch = chunk.match(/data-share-url="([^"]+)"/)
    const path = shareMatch ? decodeHtmlEntities(shareMatch[1]) : `/JobDesc.aspx?ID=${id}`
    const url = path.startsWith("http") ? path : `${SITE_ORIGIN}${path}`

    const titleMatch = chunk.match(
      /class="job-card-mobile__title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
    )
    const title = titleMatch ? clean(titleMatch[1]) : null
    if (!title) continue

    const companyMatch = chunk.match(
      /class="job-card-mobile__company-name subtitle">([\s\S]*?)<\/span>/i,
    )
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    // The location span may wrap the country in a nested <span>; capture
    // everything up to the sibling expiry span rather than the first </span>
    // so a nested close tag doesn't truncate the city.
    const locMatch = chunk.match(
      /class="job-card-mobile__location">([\s\S]*?)<span class="job-card-mobile__expiry"/i,
    )
    const location = locMatch ? clean(locMatch[1]) || null : null

    // Tecoloco's search results only show "Expira en:" (expiration), not a
    // posting date — the publish date lives on the detail page only.
    results.push({ id, title, company, location, date: null, url })
  }

  return results
}

/** Read the text value next to a `job-info-label` matching `labelPrefix`. */
function jobInfoValue(html: string, labelPrefix: string): string | null {
  const escaped = labelPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(
    `class="job-info-label">${escaped}[^<]*<\\/span>\\s*<span class="job-info-value">([\\s\\S]*?)<\\/span>`,
    "i",
  )
  const m = html.match(re)
  return m ? clean(m[1]) || null : null
}

/** Parse the single-job detail page (JobDesc.aspx?ID=<id>). */
export function parseJobDetail(html: string, id: string): JobDetail {
  const titleMatch = html.match(/<h1 class="job-title">([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  const companyMatch = html.match(/<p class="job-company">([\s\S]*?)<\/p>/i)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  // Label text is HTML-entity-escaped (e.g. "Ubicaci&oacute;n:") — match on
  // the unaccented prefix so the entity spelling doesn't matter.
  const location = jobInfoValue(html, "Ubicaci")
  const employmentType = jobInfoValue(html, "Tipo de contrataci")
  const publishedDate = jobInfoValue(html, "Fecha de Publicaci")
  const expirationDate = jobInfoValue(html, "Fecha de Expiraci")
  const experienceLevel = jobInfoValue(html, "Nivel de experiencia")

  // Description section: <h3 class="section-title">Descripción de la
  // oferta</h3> followed by <div class="section-content">...</div>. Depth-
  // tracked extraction because employer-supplied HTML occasionally nests a
  // <div>. htmlBlockToText keeps paragraph/list breaks as newlines.
  let description: string | null = null
  const sectionIdx = html.search(/<h3 class="section-title">Descripci[^<]*<\/h3>/i)
  if (sectionIdx !== -1) {
    const descHtml = extractDivContent(html.slice(sectionIdx), "section-content")
    if (descHtml) {
      description = htmlBlockToText(descHtml) || null
    }
  }

  return {
    id,
    title,
    company,
    location,
    date: publishedDate,
    url: `${DETAIL_URL}?ID=${id}`,
    description,
    employmentType,
    experienceLevel,
    publishedDate,
    expirationDate,
    // Applying always routes through Tecoloco's own login-gated flow
    // (/Jobs/Aplicar/<id>) — postings do not expose a direct external
    // company apply link.
    applyUrl: `${SITE_ORIGIN}/Jobs/Aplicar/${id}`,
  }
}
