import {
  buildSearchUrl,
  htmlFetch,
  parseJobCards,
  parseTotalCount,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * jobage filtering: Computrabajo's own posting-age query param (pubdate=) is
 * disallowed by robots.txt, so this never requests it. Instead it filters
 * the fetched page's own results client-side using the relative-time text
 * each card already carries ("Hace 2 días"). This only narrows what's on
 * the fetched page — it does not fetch extra pages to backfill the count.
 */
function filterByAge(cards: JobCard[], jobageDays: number): JobCard[] {
  if (!jobageDays || jobageDays >= 9999) return cards
  const cutoff = Date.now() - jobageDays * 86_400_000
  return cards.filter((c) => c.date !== null && new Date(c.date).getTime() >= cutoff)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const date = c.date || "—"
    return `${c.id.padEnd(34)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(34) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildSearchUrl(opts.query, opts.location, opts.page))
    let cards = parseJobCards(html)
    const total = parseTotalCount(html)
    cards = filterByAge(cards, opts.jobage)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}${c.salary ? " · " + c.salary : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, total, page: opts.page }, results: cards },
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
