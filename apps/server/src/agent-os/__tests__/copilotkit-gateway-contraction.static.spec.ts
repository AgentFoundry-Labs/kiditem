import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = resolve(__dirname, "..", "..", "..", "..", "..");
const forbidden = [
  "NestControlClient",
  "x-kiditem-interaction-gateway",
  "INTERACTION_GATEWAY_URL",
  "INTERACTION_GATEWAY_SHARED_SECRET",
  "INTERACTION_PRINCIPAL_HMAC_KEY",
  "INTERACTION_RUN_INTENT_HMAC_KEY",
  "INTERACTION_REPLAY_CURSOR_HMAC_KEY",
  "INTERACTION_ANALYTICS_HMAC_KEY",
  "AGENT_OS_AGUI_INTERNAL_URL",
  "KIDITEM_API_INTERNAL_URL",
];

describe("CopilotKit gateway contraction", () => {
  it("has no standalone gateway workspace", () => {
    expect(existsSync(resolve(repository, "apps", "interaction-gateway"))).toBe(false);
  });

  it("keeps gateway-only production configuration out of the API adapter", () => {
    const source = readFileSync(
      resolve(repository, "apps", "server", "src", "agent-os", "agent-os-http.module.ts"),
      "utf8",
    );
    for (const symbol of forbidden) expect(source).not.toContain(symbol);
  });

  it("keeps every retired gateway identifier out of production source and deploy inputs", () => {
    const roots = ["apps", "deploy", "scripts"];
    const allowedFixture = "apps/server/src/agent-os/__tests__/copilotkit-gateway-contraction.static.spec.ts";
    const files: string[] = [];
    const walk = (relative: string) => {
      const absolute = resolve(repository, relative);
      if (!existsSync(absolute)) return;
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const child = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!["node_modules", "dist", ".next", "coverage"].includes(entry.name)) walk(child);
        } else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|mjs|json|ya?ml)$/.test(child) && !child.includes("/__tests__/") && !/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(child)) {
          files.push(child);
        }
      }
    };
    roots.forEach(walk);
    for (const relative of files) {
      if (relative === allowedFixture) continue;
      const source = readFileSync(resolve(repository, relative), "utf8");
      for (const symbol of forbidden) {
        expect(source, `${relative} contains ${symbol}`).not.toContain(symbol);
      }
    }
  });

  it("keeps the architecture map aligned with the Nest adapter and sequence coordinate", () => {
    const architecture = readFileSync(resolve(repository, "docs", "ARCHITECTURE.md"), "utf8");
    for (const stale of ["apps/server/src/chat", "live-join token"]) {
      expect(architecture, `architecture contains stale ${stale}`).not.toContain(stale);
    }
    expect(architecture).toContain("AgentOsInteractionHttpModule");
    expect(architecture).toContain("sequence coordinate");
  });

  it("keeps durable interaction documentation free of retired gateway restart and secret terminology", () => {
    for (const relative of ["docs/ARCHITECTURE.md", "docs/references/copilotkit-platform-matrix.md"]) {
      const source = readFileSync(resolve(repository, relative), "utf8");
      expect(source, `${relative} retains gateway-secret terminology`).not.toContain("gateway-secret");
      expect(source, `${relative} retains a gateway restart boundary`).not.toMatch(/\bgateway, API, and worker restart\b/i);
      expect(source, `${relative} retains the retired KidItem gateway topology`).not.toMatch(/\bKidItem gateway\b/i);
      expect(source).toContain("Nest");
    }
  });

  it("keeps local CLI process lifetime bound to the current API container boot", () => {
    const runbook = readFileSync(resolve(repository, "docs", "runbooks", "environment-variables.md"), "utf8");
    expect(runbook).toContain("Current API container boot");
    expect(runbook).toContain("API container termination is the boundary");
    expect(readFileSync(resolve(repository, "apps", "server", "Dockerfile"), "utf8")).toContain("Node is PID 1 for the API container");
    const runtime = resolve(repository, "apps", "server", "src", "agent-os", "adapter", "out", "runtime");
    expect(existsSync(resolve(runtime, "local-isolated-cli-supervisor.ts"))).toBe(false);
  });
});
