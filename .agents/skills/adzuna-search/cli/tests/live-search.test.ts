import { describe, expect, test } from "bun:test";
import { hasLiveCredentials, parseJSON, runCLI } from "./helpers";

// Live smoke test against the real Adzuna API, per add-portal.md's Step 4
// ("never register a portal skill that has not returned real results").
// Skipped automatically when ADZUNA_APP_ID/ADZUNA_APP_KEY are not set in the
// environment - these are free but personal credentials, never committed to
// the repo, so CI and fresh clones legitimately won't have them. Run locally
// with both variables exported to exercise this file for real.
describe.skipIf(!hasLiveCredentials())("Adzuna live search + detail (requires real credentials)", () => {
  test("search 'project manager' returns real, complete results", async () => {
    const result = await runCLI(["search", "-q", "project manager", "--limit", "5"]);
    const data = parseJSON<{ meta: { count: number; page: number }; results: any[] }>(result);

    expect(result.exitCode).toBe(0);
    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.title).not.toMatch(/<[a-z]+>/i); // no leftover HTML tags
      expect(job.url).toMatch(/^https?:\/\//);
    }
  }, 30000);

  test("detail on a real result's url returns readable text", async () => {
    // Adzuna search results mix two url flavors: canonical
    // adzuna.com/details/<id> pages (always fetchable) and
    // adzuna.com/land/ad/<id> tracking-redirect pages, which sit behind bot
    // protection on Adzuna's own site and return a hard 403 regardless of
    // User-Agent (confirmed manually - not something this CLI can work
    // around, and SKILL.md already documents detail's fetch as best-effort
    // against an arbitrary third-party destination). Try a few real results
    // rather than hard-coding results[0], the same way a human using this
    // skill would just try the next listing if one URL didn't cooperate.
    const searchResult = await runCLI(["search", "-q", "project manager", "--limit", "5"]);
    const data = parseJSON<{ results: any[] }>(searchResult);
    expect(data.results.length).toBeGreaterThan(0);

    let succeeded = false;
    let lastError = "";
    for (const job of data.results) {
      const detailResult = await runCLI(["detail", job.url, "--format", "plain"]);
      if (detailResult.exitCode === 0 && detailResult.stdout.length > 0) {
        succeeded = true;
        break;
      }
      lastError = detailResult.stderr;
    }
    expect(succeeded, `all detail attempts failed; last error: ${lastError}`).toBe(true);
  }, 60000);
});
