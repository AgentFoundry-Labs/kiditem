import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const portsRoot = resolve(__dirname, "..", "..");

function portFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : portFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("AgentOS application port purity", () => {
  it("keeps every application port free of Nest, environment reads, and provider factories", () => {
    for (const path of portFiles(portsRoot)) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/from\s+["']@nestjs\//);
      expect(source, path).not.toContain("process.env");
      expect(source, path).not.toMatch(/\b(?:useFactory|Provider)\b/);
    }
  });
});
