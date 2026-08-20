import { describe, expect, test } from "bun:test";
import { envWithoutCredentials, runCLI } from "./helpers";

// The portal-skill contract's deviation for this skill: two credentials
// (ADZUNA_APP_ID, ADZUNA_APP_KEY) instead of the usual single <SERVICE>_API_TOKEN.
// If either is unset, the CLI must exit 1 with a MISSING_CREDENTIALS stderr error
// naming exactly which variable(s) are missing, and must never fall through to an
// unauthenticated request against Adzuna's API.
describe("Adzuna credential handling", () => {
  test("search with both credentials unset fails with MISSING_CREDENTIALS naming both", async () => {
    const env = envWithoutCredentials();
    const result = await runCLI(["search", "--query", "project manager"], env);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("MISSING_CREDENTIALS");
    expect(error.error).toContain("ADZUNA_APP_ID");
    expect(error.error).toContain("ADZUNA_APP_KEY");
    expect(error.error).toContain("developer.adzuna.com/signup");
  });

  test("search with only ADZUNA_APP_ID set still fails, naming just ADZUNA_APP_KEY", async () => {
    const env = { ...envWithoutCredentials(), ADZUNA_APP_ID: "fake-id" };
    const result = await runCLI(["search", "--query", "project manager"], env);

    expect(result.exitCode).toBe(1);
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("MISSING_CREDENTIALS");
    expect(error.error).toContain("ADZUNA_APP_KEY");
    expect(error.error).not.toContain("ADZUNA_APP_ID.");
  });

  test("search with only ADZUNA_APP_KEY set still fails, naming just ADZUNA_APP_ID", async () => {
    const env = { ...envWithoutCredentials(), ADZUNA_APP_KEY: "fake-key" };
    const result = await runCLI(["search", "--query", "project manager"], env);

    expect(result.exitCode).toBe(1);
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("MISSING_CREDENTIALS");
    expect(error.error).toContain("ADZUNA_APP_ID");
  });

  test("detail with a url never requires credentials (no Adzuna API call)", async () => {
    // detail <url> fetches the third-party listing page directly, not Adzuna's
    // API, so it must not be gated on ADZUNA_APP_ID/ADZUNA_APP_KEY. This uses an
    // address guaranteed to fail fast (invalid TLD) purely to prove no
    // MISSING_CREDENTIALS error is raised - a DETAIL_FAILED network error is fine.
    const env = envWithoutCredentials();
    const result = await runCLI(["detail", "https://example.invalid/job/1"], env);

    expect(result.exitCode).toBe(1);
    const error = JSON.parse(result.stderr);
    expect(error.code).not.toBe("MISSING_CREDENTIALS");
  });
});
