// Data source: Computrabajo El Salvador's public server-rendered search and
// detail pages (sv.computrabajo.com — www.computrabajo.com.sv/www.computrabajo.sv
// both 301-redirect there). No JSON API was found; we parse the HTML with
// regex, chunked per result card, so one malformed card cannot break the rest
// (same approach as linkedin-search's parseJobCards).
//
// Personal use only — see SKILL.md for the Condiciones Legales note. Keep
// volume low.

export const BASE_URL = "https://sv.computrabajo.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; computrabajo-sv-search-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-SV,es;q=0.9,en;q=0.5",
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
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  contractType: string | null
  employmentType: string | null
  requirements: string[]
  keywords: string[]
  applyUrl: string | null
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

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Build a URL slug the way Computrabajo's own site does: lowercase, strip
 * diacritics (atención -> atencion), collapse non-alphanumerics to hyphens.
 * Verified against live search-filter links (both the query slug in
 * /trabajo-de-<slug> and the department slug in .../trabajo-de-x-en-<slug>
 * are built this exact way — e.g. "Usulután" -> "usulutan").
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics left by NFD normalization
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** El Salvador's 14 departments (+ "Extranjero"), for documentation/validation. slugify() alone already produces the correct URL slug for each. */
export const SV_DEPARTMENTS = [
  "San Salvador",
  "La Libertad",
  "San Miguel",
  "Santa Ana",
  "Sonsonate",
  "La Paz",
  "Usulután",
  "Ahuachapán",
  "Chalatenango",
  "Cuscatlán",
  "La Unión",
  "San Vicente",
  "Cabañas",
  "Morazán",
  "Extranjero",
]

/** Build the search-results URL for a query slug, optional department, and page. */
export function buildSearchUrl(query: string, location: string | undefined, page: number): string {
  let path = `/trabajo-de-${slugify(query)}`
  if (location) path += `-en-${slugify(location)}`
  const url = new URL(path, BASE_URL)
  if (page > 1) url.searchParams.set("p", String(page))
  return url.toString()
}

/**
 * Build a detail-page URL from a bare job ID. Computrabajo's detail path is
 * /ofertas-de-trabajo/<any-slug>-<ID> — verified live that the descriptive
 * slug segment is cosmetic (any non-empty filler resolves the same page), so
 * a fixed filler works for any ID without knowing the real posting slug.
 */
export function detailUrlFromId(id: string): string {
  return `${BASE_URL}/ofertas-de-trabajo/oferta-de-trabajo-de-x-${id}`
}

/** Extract a Computrabajo job ID (32-char hex) from a bare ID or a full URL. */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^[0-9A-Fa-f]{20,40}$/)
  if (bare) return input.toUpperCase()
  const fromUrl = input.match(/-([0-9A-Fa-f]{20,40})(?:[?#]|$)/)
  return fromUrl ? fromUrl[1].toUpperCase() : null
}

/**
 * Convert Computrabajo's relative-time text ("Hace 49 minutos", "Hace 2
 * días") to an approximate ISO date. "Hace más de 30 días" is intentionally
 * imprecise on the site itself (no exact count is shown), so it maps to
 * null rather than a fabricated cutoff date.
 */
export function parseRelativeDate(raw: string | null): string | null {
  if (!raw) return null
  const text = raw.replace(/\s+/g, " ").trim().toLowerCase()
  if (/m[aá]s de/.test(text)) return null
  const m = text.match(/hace\s+(\d+)\s*(minutos?|horas?|d[ií]as?)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2]
  const ms = unit.startsWith("minuto") ? n * 60_000 : unit.startsWith("hora") ? n * 3_600_000 : n * 86_400_000
  return new Date(Date.now() - ms).toISOString().slice(0, 10)
}

const SPANISH_MONTHS: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
}

/**
 * Parse the detail page's "<day> de <month>" date (no year given — the site
 * implies "this year unless that's in the future," in which case last year).
 */
export function parseSpanishLongDate(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{1,2})\s+de\s+([a-zA-Zá-úñÑ]+)/i)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = SPANISH_MONTHS[m[2].toLowerCase()]
  if (!month || day < 1 || day > 31) return null
  const now = new Date()
  let year = now.getFullYear()
  const candidate = new Date(`${year}-${month}-${String(day).padStart(2, "0")}T00:00:00Z`)
  if (candidate.getTime() > now.getTime() + 86_400_000) year -= 1
  return `${year}-${month}-${String(day).padStart(2, "0")}`
}

/**
 * Extract the inner HTML of the first element matching `openRe`, correctly
 * handling nested <div> elements by tracking tag depth (copied pattern from
 * linkedin-search's extractDivContent, generalized to any opening-tag regex
 * since Computrabajo's description block is identified by an attribute,
 * not a class name).
 */
function extractDivFrom(html: string, openRe: RegExp): string | null {
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
 * Parse the search-results page: a flat list of <article class="box_offer">
 * cards. We split on the article marker and parse each chunk independently
 * so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split('<article class="box_offer').slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.slice(0, 300).match(/data-id='([0-9A-Fa-f]+)'/)
    if (!idMatch) continue
    const id = idMatch[1]

    const linkMatch = chunk.match(/class="js-o-link fc_base" href="([^"]+)">([\s\S]*?)<\/a>/)
    if (!linkMatch) continue
    const title = clean(linkMatch[2])
    if (!title) continue
    const rawUrl = decodeHtmlEntities(linkMatch[1]).split("#")[0]
    const url = rawUrl.startsWith("http") ? rawUrl : `${BASE_URL}${rawUrl}`

    let company: string | null = null
    let companyUrl: string | null = null
    const companyMatch = chunk.match(
      /<a class="fc_base t_ellipsis" href="([^"]+)"[^>]*offer-grid-article-company-url>([\s\S]*?)<\/a>/,
    )
    if (companyMatch) {
      companyUrl = decodeHtmlEntities(companyMatch[1])
      company = clean(companyMatch[2]) || null
    }

    const locMatch = chunk.match(/<p class="fs16 fc_base mt5">\s*<span class="mr10">([\s\S]*?)<\/span>/)
    const location = locMatch ? clean(locMatch[1]) || null : null

    const salaryMatch = chunk.match(/class="icon i_salary"><\/span>\s*([\s\S]*?)<\/span>/)
    const salary = salaryMatch ? clean(salaryMatch[1]) || null : null

    const dateMatch = chunk.match(/<p class="fs13 fc_aux mt15">([\s\S]*?)<\/p>/)
    const date = dateMatch ? parseRelativeDate(clean(dateMatch[1])) : null

    results.push({ id, title, company, companyUrl, location, date, url, salary })
  }

  return results
}

/** Parse the total-results count from the search page's "<N> Ofertas de trabajo..." heading. */
export function parseTotalCount(html: string): number | null {
  const h1 = html.match(/<h1 class="title_page"[^>]*>([\s\S]*?)<\/h1>/i)
  if (!h1) return null
  const countMatch = h1[1].match(/<span class="fwB">\s*([\d.,]+)\s*<\/span>/)
  if (!countMatch) return null
  const n = parseInt(countMatch[1].replace(/[.,]/g, ""), 10)
  return isNaN(n) ? null : n
}

/** Parse a single-job detail page. */
export function parseJobDetail(html: string, id: string): JobDetail {
  const h1 = html.match(/<h1 class="fwB fs24[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
  const title = h1 ? clean(h1[1]) : ""
  if (!title) {
    throw new Error("Failed to parse job listing HTML")
  }

  const subtitle = html.match(/<\/h1>\s*<p class="fs16">([\s\S]*?)<\/p>/i)
  let company: string | null = null
  let location: string | null = null
  if (subtitle) {
    const line = clean(subtitle[1])
    const dashIdx = line.indexOf(" - ")
    if (dashIdx !== -1) {
      company = line.slice(0, dashIdx).trim() || null
      location = line.slice(dashIdx + 3).trim() || null
    } else {
      location = line || null
    }
  }

  const descBlock = extractDivFrom(html, /<div[^>]*div-link="oferta"[^>]*>/i)

  let salary: string | null = null
  let contractType: string | null = null
  let employmentType: string | null = null
  let description: string | null = null
  const requirements: string[] = []
  const keywords: string[] = []
  let updatedDate: string | null = null

  if (descBlock) {
    const tags = [...descBlock.matchAll(/<span class="tag base mb10">([\s\S]*?)<\/span>/g)].map((m) =>
      clean(m[1]),
    )
    if (tags.length === 3) {
      ;[salary, contractType, employmentType] = tags
    } else if (tags.length === 2) {
      ;[contractType, employmentType] = tags
    } else if (tags.length === 1) {
      ;[employmentType] = tags
    }

    const descMatch = descBlock.match(/<p class="mbB">([\s\S]*?)<\/p>/)
    if (descMatch) {
      const withBreaks = descMatch[1].replace(/<br\s*\/?>/gi, "\n")
      description = decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() || null
    }

    const reqBlock = descBlock.match(/Requerimientos<\/p>\s*<ul class="disc mbB">([\s\S]*?)<\/ul>/)
    if (reqBlock) {
      for (const li of reqBlock[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
        const text = clean(li[1])
        if (text) requirements.push(text)
      }
    }

    const kwMatch = descBlock.match(/Palabras clave:\s*([\s\S]*?)<\/p>/)
    if (kwMatch) {
      for (const kw of clean(kwMatch[1]).split(",")) {
        const trimmed = kw.trim()
        if (trimmed) keywords.push(trimmed)
      }
    }

    // The "last updated" paragraph shows either an absolute date ("12 de
    // agosto (actualizada)") or, for very recent postings, the same
    // relative-time phrasing as search cards ("Hace 2 días (actualizada)") -
    // verified live, both shapes occur. Try both parsers.
    const dateMatch = descBlock.match(/<p class="fc_aux fs13">([\s\S]*?)<\/p>/)
    if (dateMatch) {
      const dateText = clean(dateMatch[1])
      updatedDate = parseSpanishLongDate(dateText) ?? parseRelativeDate(dateText)
    }
  }

  let applyUrl: string | null = null
  const applyMatch = html.match(/data-href-offer-apply="([^"]+)"/)
  if (applyMatch) applyUrl = decodeHtmlEntities(applyMatch[1])

  return {
    id,
    title,
    company,
    companyUrl: null,
    location,
    date: updatedDate,
    url: detailUrlFromId(id),
    salary,
    description,
    contractType,
    employmentType,
    requirements,
    keywords,
    applyUrl,
  }
}
