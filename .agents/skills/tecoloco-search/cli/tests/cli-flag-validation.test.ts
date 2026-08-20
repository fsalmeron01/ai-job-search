import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("Tecoloco CLI flag validation", () => {
  describe("--page validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-q", "test", "--page", "abc"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/page/);
    });

    test("valid integer passes validation", async () => {
      const result = await runCLI(["search", "-q", "test", "--page", "2", "--limit", "1"]);
      const err = parsedStderr(result.stderr);
      expect(err.code).not.toBe("BAD_ARG");
    });
  });

  describe("--per-page validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-q", "test", "--per-page", "xyz"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/per-page/);
    });

    test("a value outside 40/80/100 exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-q", "test", "--per-page", "50"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toContain("40, 80, or 100");
    });

    test("40, 80, and 100 all pass validation", async () => {
      for (const v of ["40", "80", "100"]) {
        const result = await runCLI(["search", "-q", "test", "--per-page", v, "--limit", "0"]);
        const err = parsedStderr(result.stderr);
        expect(err.code).not.toBe("BAD_ARG");
      }
    });
  });

  describe("--limit validation", () => {
    test("non-numeric string exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-q", "test", "--limit", "xyz"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/limit/);
    });
  });

  describe("detail requires an id", () => {
    test("missing id exits 1 with NO_ID", async () => {
      const result = await runCLI(["detail"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("NO_ID");
    });

    test("an unparseable id exits 1 with BAD_ID", async () => {
      const result = await runCLI(["detail", "not-a-valid-id"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ID");
    });
  });

  describe("unknown command", () => {
    test("exits 1 with BAD_CMD", async () => {
      const result = await runCLI(["frobnicate"]);
      expect(result.exitCode).not.toBe(0);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_CMD");
    });
  });
});

describe("unknown flag rejection", () => {
  // add-portal.md's contract: "a bogus flag or missing required arg exits 1
  // with a JSON error on stderr". A silently discarded flag is worse than an
  // error — it changes what the search returns with no indication anything
  // was wrong. Rejection happens before dispatch, so these are network-free.
  test("a bogus --flag on search exits 1 with a JSON error instead of being silently discarded", async () => {
    const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus-flag");
  });

  test("a bogus --flag on detail exits 1 with a JSON error", async () => {
    const result = await runCLI(["detail", "123", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
  });

  test("--location is not a recognized flag — Tecoloco has no location parameter", async () => {
    // Regression guard: Tecoloco is El Salvador-only and has no city/region
    // search parameter, so --location must not silently be accepted and
    // dropped. Users are directed to fold a city into --query instead.
    const result = await runCLI(["search", "-q", "test", "--location", "San Salvador"]);
    expect(result.exitCode).toBe(1);
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
  });

  test("--jobage is not a recognized flag — the portal exposes no posting-age filter", async () => {
    const result = await runCLI(["search", "-q", "test", "--jobage", "7"]);
    expect(result.exitCode).toBe(1);
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
  });
});
