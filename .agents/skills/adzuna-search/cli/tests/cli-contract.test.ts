import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

describe("Adzuna CLI error contract", () => {
  test("detail without a url fails before making a request", async () => {
    const result = await runCLI(["detail"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'detail requires a <url> (the "url" field from a search result)',
      code: "NO_ID",
    });
  });

  test("detail with a bare id (not a url) fails with NO_DETAIL_ENDPOINT, no network call", async () => {
    const result = await runCLI(["detail", "1234567890"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("NO_DETAIL_ENDPOINT");
    expect(error.error).toContain("search");
  });

  test("an invalid numeric option fails before making a request", async () => {
    const result = await runCLI(["search", "--query", "test", "--page", "not-a-number"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: '--page must be a number, got "not-a-number"',
      code: "BAD_ARG",
    });
  });

  test("an invalid --sort-by value fails before making a request", async () => {
    const result = await runCLI(["search", "--sort-by", "popularity"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("BAD_ARG");
    expect(error.error).toContain("--sort-by");
  });

  test("an unknown flag is rejected rather than silently ignored", async () => {
    const result = await runCLI(["search", "--bogus", "value"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus");
  });

  test("an unknown command fails with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: 'Unknown command "frobnicate"',
      code: "BAD_CMD",
    });
  });

  test("search --help prints usage and exits 0", async () => {
    const result = await runCLI(["search", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("adzuna-cli");
    expect(result.stdout).toContain("ADZUNA_APP_ID");
  });
});
