import { readFileSync, writeFileSync } from "node:fs";

/**
 * Rewrites keys in a dotenv file in place, keeping comments, ordering, and untouched
 * entries exactly as they were. Deployment scripts use it so a fresh set of addresses
 * lands in .env without anyone copying hex by hand.
 *
 * Keys already present are replaced; keys that are missing are appended.
 */
export function updateEnvFile(envFilePath: string, updates: Record<string, string>): void {
  const originalContents = readFileSync(envFilePath, "utf8");
  const lines = originalContents.split("\n");
  const pendingKeys = new Set(Object.keys(updates));

  const rewrittenLines = lines.map((line) => {
    const match = /^(\s*)([A-Z0-9_]+)(\s*)=/.exec(line);
    if (match === null) {
      return line;
    }
    const key = match[2];
    if (key === undefined || !pendingKeys.has(key)) {
      return line;
    }
    pendingKeys.delete(key);
    return `${match[1] ?? ""}${key}=${updates[key] ?? ""}`;
  });

  for (const remainingKey of pendingKeys) {
    rewrittenLines.push(`${remainingKey}=${updates[remainingKey] ?? ""}`);
  }

  writeFileSync(envFilePath, rewrittenLines.join("\n"), { mode: 0o600 });
}
