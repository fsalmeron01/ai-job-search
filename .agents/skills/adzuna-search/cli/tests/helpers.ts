import { join } from "path";

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the CLI as a subprocess. `env`, when provided, REPLACES the child's
 * environment entirely (rather than merging with the current process's) so
 * credential tests can reliably assert on ADZUNA_APP_ID/ADZUNA_APP_KEY being
 * absent, regardless of what the host running the tests happens to export.
 */
export async function runCLI(args: string[], env?: Record<string, string>): Promise<CLIResult> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: env ?? (process.env as Record<string, string>),
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/** The current env with ADZUNA_APP_ID/ADZUNA_APP_KEY stripped out. */
export function envWithoutCredentials(): Record<string, string> {
  const env = { ...(process.env as Record<string, string>) };
  delete env.ADZUNA_APP_ID;
  delete env.ADZUNA_APP_KEY;
  return env;
}

export function hasLiveCredentials(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim());
}

export function parseJSON<T = unknown>(result: CLIResult): T {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited with code ${result.exitCode}. stderr: ${result.stderr}`
    );
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(
      `Failed to parse JSON. stdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}
