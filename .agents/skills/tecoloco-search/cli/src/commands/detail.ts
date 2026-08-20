import { DETAIL_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a raw numeric job ID, a JobDesc.aspx?ID=<id> URL, or a
 * /<id>/<slug>.aspx canonical URL (the form search results and shared links
 * use). Tecoloco 404s a /<id>/<slug>.aspx URL if the slug doesn't match
 * exactly, so `detail` always re-fetches through JobDesc.aspx?ID=<id> instead
 * — that endpoint accepts the bare ID regardless of slug.
 */
function normalizeId(input: string): string | null {
  const qs = input.match(/[?&]ID=(\d+)/i)
  if (qs) return qs[1]
  const path = input.match(/\/(\d+)\/[^/?]+\.aspx/i)
  if (path) return path[1]
  const bare = input.match(/^\d+$/)
  if (bare) return input
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${DETAIL_URL}?ID=${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.employmentType ? `Tipo de contratación: ${job.employmentType}` : "",
        job.experienceLevel ? `Nivel de experiencia: ${job.experienceLevel}` : "",
        job.publishedDate ? `Publicado: ${job.publishedDate}` : "",
        job.expirationDate ? `Expira: ${job.expirationDate}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Aplicar: ${job.applyUrl} (requires a Tecoloco account)` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
