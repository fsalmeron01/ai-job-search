#!/usr/bin/env bun
// Self-contained CLI for searching US job listings via Adzuna's official public
// JSON REST API (api.adzuna.com). No external CLI framework, so it runs
// anywhere `bun` is available with zero install beyond the repo clone.
//
// Requires two credentials, read only from the environment (never a CLI flag):
//   ADZUNA_APP_ID, ADZUNA_APP_KEY - free, instant signup at
//   https://developer.adzuna.com/signup (no payment card required).
//
// Default Adzuna API access limits: 25 hits/minute, 250 hits/day, 1000
// hits/week, 2500 hits/month. Keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `adzuna-cli — search US job listings via Adzuna's public API

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <url> [--format json|plain]

REQUIRES (environment variables, never CLI flags)
  ADZUNA_APP_ID    Adzuna application ID
  ADZUNA_APP_KEY   Adzuna application key
  Sign up free: https://developer.adzuna.com/signup

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role). e.g. "project manager".
  --location, -l <text>   Place string, e.g. "Austin, TX", "Chicago", "Remote".
  --jobage <days>         Max posting age in days (Adzuna's max_days_old). Default: all.
  --page <n>              1-indexed page (Adzuna's own page numbering). Default 1.
  --limit, -n <n>         Cap results emitted (also bounds results_per_page, 1-50).
  --category <tag>        Adzuna category tag (see /docs/categories), e.g. "it-jobs".
  --sort-by <order>       default | hybrid | date | salary | relevance.
  --salary-min <n>        Minimum salary filter.
  --salary-max <n>        Maximum salary filter.
  --exclude <text>        Keywords to exclude (what_exclude).
  --full-time             Only full-time postings.
  --part-time             Only part-time postings.
  --contract              Only contract postings.
  --permanent             Only permanent postings.
  --format <fmt>          json (default) | table | plain.

DETAIL FLAGS
  <url>            Required. The "url" field from a search result (Adzuna's redirect_url).
                   Adzuna's API has no lookup-by-id endpoint - see SKILL.md's Notes section.
  --format <fmt>   json (default) | plain.

EXAMPLES
  bun run src/cli.ts search -q "project manager" -l "Austin, TX" --format table
  bun run src/cli.ts search -q "software engineer" -l "Chicago" --jobage 7 --format table
  bun run src/cli.ts search -q "marketing manager" --sort-by date --limit 10 --format table
  bun run src/cli.ts detail "https://www.adzuna.com/details/1234567890" --format plain

All errors are written to stderr as { "error": "...", "code": "..." } with exit code 1.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "jobage", "page", "limit", "format",
    "category", "sort-by", "salary-min", "salary-max", "exclude",
    "full-time", "part-time", "contract", "permanent",
    "help", "h",
  ]),
  detail: new Set(["format", "help", "h"]),
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags instead of silently discarding them: a discarded
  // filter changes what the search returns with no error. add-portal.md's
  // contract requires a bogus flag to exit 1 with a JSON error on stderr.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      writeError(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
      return 1
    }
  }

  const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
    const val = parseInt(raw as string, 10)
    if (isNaN(val)) {
      writeError(`--${name} must be a number, got "${raw}"`, "BAD_ARG")
      return null
    }
    return val
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    for (const name of ["jobage", "page", "limit", "salary-min", "salary-max"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const sortBy = typeof flags["sort-by"] === "string" ? (flags["sort-by"] as string) : undefined
    if (sortBy && !["default", "hybrid", "date", "salary", "relevance"].includes(sortBy)) {
      writeError(
        `--sort-by must be one of: default, hybrid, date, salary, relevance (got "${sortBy}")`,
        "BAD_ARG",
      )
      return 1
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
      category: typeof flags.category === "string" ? flags.category : undefined,
      sortBy,
      salaryMin: flags["salary-min"] ? parseInt(flags["salary-min"] as string, 10) : undefined,
      salaryMax: flags["salary-max"] ? parseInt(flags["salary-max"] as string, 10) : undefined,
      exclude: typeof flags.exclude === "string" ? flags.exclude : undefined,
      fullTime: flags["full-time"] === true,
      partTime: flags["part-time"] === true,
      contract: flags.contract === true,
      permanent: flags.permanent === true,
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires a <url> (the \"url\" field from a search result)", "NO_ID")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  writeError(`Unknown command "${cmd}"`, "BAD_CMD")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
