import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against the real Tecoloco.com.sv site (add-portal.md Step 4:
// "Never register a portal skill that has not returned real results"). Keep
// this file small and low-volume — a handful of requests, not a crawl.

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{ id: string; title: string; company: string | null; location: string | null; url: string }>;
}

describe("live: search", () => {
  test("'atencion al cliente' returns real, non-empty results", async () => {
    const result = await runCLI(["search", "-q", "atencion al cliente", "--limit", "5", "--format", "json"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);

    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id).toMatch(/^\d+$/);
      expect(job.title.trim().length).toBeGreaterThan(0);
      expect(job.title).not.toMatch(/<[a-z]/i); // no leaked HTML tags
      expect(job.url.startsWith("https://www.tecoloco.com.sv/")).toBe(true);
    }
  }, 30000);
});

describe("live: detail", () => {
  test("detail on a real ID returns a readable description", async () => {
    const search = await runCLI(["search", "-q", "atencion al cliente", "--limit", "1", "--format", "json"]);
    const { results } = parseJSON<SearchResult>(search);
    expect(results.length).toBeGreaterThan(0);
    const id = results[0].id;

    const detail = await runCLI(["detail", id, "--format", "json"]);
    expect(detail.exitCode).toBe(0);
    const job = parseJSON<{ title: string; description: string | null; url: string; applyUrl: string | null }>(detail);

    expect(job.title.trim().length).toBeGreaterThan(0);
    expect(job.url).toBe(`https://www.tecoloco.com.sv/JobDesc.aspx?ID=${id}`);
    expect(job.applyUrl).toBe(`https://www.tecoloco.com.sv/Jobs/Aplicar/${id}`);
    // Description is normally present; some postings genuinely omit one, so
    // only assert shape (no leaked tags) when it exists.
    if (job.description) {
      expect(job.description).not.toMatch(/<[a-z]/i);
    }
  }, 30000);

  test("a bogus job ID returns NOT_FOUND instead of throwing", async () => {
    const result = await runCLI(["detail", "999999999", "--format", "json"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({ error: "Job not found", code: "NOT_FOUND" });
  }, 30000);
});
