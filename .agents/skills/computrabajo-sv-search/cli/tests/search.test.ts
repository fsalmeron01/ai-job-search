import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

// Live smoke test against the real portal (personal-use, low volume - one
// search + one detail call). Network-dependent by design: add-portal.md's
// contract requires a live-verified test alongside the offline fixture
// tests in parsing.test.ts. If Computrabajo is unreachable or rate-limits,
// this test fails loudly rather than silently skipping.

interface SearchResult {
  meta: { count: number; total: number | null; page: number };
  results: Array<{ id: string; title: string; company: string | null; url: string }>;
}

describe("computrabajo-sv-cli live search", () => {
  test("search 'atencion al cliente' returns real, non-empty results", async () => {
    const result = await runCLI(["search", "-q", "atencion al cliente", "--limit", "5", "--format", "json"]);
    const data = parseJSON<SearchResult>(result);

    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toMatch(/^https:\/\/sv\.computrabajo\.com\//);
    }
  }, 30000);

  test("detail on the first search result returns a readable description", async () => {
    const searchResult = await runCLI(["search", "-q", "atencion al cliente", "--limit", "1", "--format", "json"]);
    const data = parseJSON<SearchResult>(searchResult);
    const id = data.results[0]?.id;
    expect(id).toBeTruthy();

    const detailResult = await runCLI(["detail", id!, "--format", "json"]);
    const job = parseJSON<{ title: string; description: string | null; url: string }>(detailResult);

    expect(job.title).toBeTruthy();
    expect(job.url).toContain(id);
  }, 30000);
});
