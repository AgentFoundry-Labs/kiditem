#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function productionFiles(directory) {
  if (!existsSync(directory)) return [];
  if (statSync(directory).isFile()) {
    return /(?:\.(?:ts|tsx|mjs|prisma|json|conf|ya?ml)|\.env\.example|\.example)$/.test(
      path.basename(directory),
    )
      ? [directory]
      : [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : productionFiles(absolute);
    }
    return entry.isFile() &&
      /(?:\.(?:ts|tsx|mjs|prisma|json|conf|ya?ml)|\.env\.example|\.example)$/.test(
        entry.name,
      ) &&
      !/\.(?:spec|test)\.(?:ts|tsx|mjs)$/.test(entry.name)
      ? [absolute]
      : [];
  });
}

const hasPath = (filePath, expression) => expression.test(filePath);

function findingsFor({ path: filePath, source }) {
  const findings = [];
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /\bAgent(?:Run(?:Request|Event)?|Execution(?:Attempt)?)\b/.test(source)
  )
    findings.push("legacy AgentRun symbol");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:conversation|message|event|replay|summarizer|live-publisher|live-join)/i,
    )
  )
    findings.push("legacy conversation/replay surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:artifact|materialization|provider-upload|storage-agent-session)/i,
    )
  )
    findings.push("legacy artifact/storage surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(filePath, /(?:cost|usage)/i)
  )
    findings.push("legacy usage/cost surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:authority-profile|policy-snapshot|execution-grant|dispatch-outbox)/i,
    )
  )
    findings.push("legacy authority/grant/outbox surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(filePath, /(?:playbook|tool-wrapper)/i)
  )
    findings.push("legacy fixed playbook/tool-wrapper surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /\bruntimeKind\s*:\s*["']tool_wrapper["']|\bdefaultToolPolicies\s*:|\bplaybookKeys\s*:/.test(
      source,
    )
  )
    findings.push("legacy fixed playbook/tool-wrapper metadata");
  if (
    filePath ===
      "apps/server/src/agent-os/application/port/out/capability/agent-capability-handler.port.ts" &&
    /\bexecutionKind\b/.test(source) &&
    /\bsideEffects\b/.test(source) &&
    /(?:\bArtifactOutput\b|\bartifacts?\b)/.test(source)
  )
    findings.push("legacy handler metadata");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /(?:continuationMode|continuationKey|background continuation|operation-to-agent|-continuation\.)/i.test(
      source + filePath,
    )
  )
    findings.push("legacy continuation surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /(?:advisory|release-drain|coordinated-deletion)/i.test(source + filePath)
  )
    findings.push("legacy advisory/release/deletion surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    hasPath(
      filePath,
      /(?:hermes|openai|gateway|credential-broker|handle-codec|provider-session)/i,
    )
  )
    findings.push("legacy provider/gateway runtime surface");
  if (
    hasPath(filePath, /^apps\/server\/src\/agent-os\//) &&
    /(?:KIDITEM_MCP_EXECUTION_CONTEXT|INTERACTION_[A-Z_]*HMAC_KEY|AGENT_RUNTIME_CREDENTIAL_HMAC_KEY|full-nest-mcp)/.test(
      source + filePath,
    )
  )
    findings.push("legacy full-Nest MCP/HMAC runtime surface");
  if (
    hasPath(filePath, /^apps\/web\/src\/app\/\(automation\)\/agents\//) ||
    hasPath(
      filePath,
      /^apps\/web\/src\/app\/agent-os\/(?:components|lib|network)\//,
    )
  )
    findings.push("legacy Web Agent OS path");
  if (
    [
      "packages/shared/src/agent-os.ts",
      "packages/shared/src/schemas/agent-os.ts",
    ].includes(filePath)
  )
    findings.push("legacy shared Agent OS export");
  if (
    hasPath(
      filePath,
      /^packages\/shared\/src\/agent-interaction\/(?:durable-runtime|deletion|ui)\.ts$/,
    )
  )
    findings.push("legacy shared interaction export");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Run(?:Request|Event)?|Execution(?:Attempt)?)\b/.test(
      source,
    )
  )
    findings.push("legacy AgentRun model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Conversation|Message|ConversationEvent|ConversationOutbox)\b/.test(
      source,
    )
  )
    findings.push("legacy conversation/replay model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Artifact|SessionArtifact|SessionArtifactMaterialization)\b/.test(
      source,
    )
  )
    findings.push("legacy artifact/storage model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:ExecutionUsage|CostEvent)\b/.test(source)
  )
    findings.push("legacy usage/cost model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+AgentSessionApprovalContinuation\b/.test(source)
  )
    findings.push("legacy continuation model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+AgentSessionDeletionOperationBinding\b/.test(source)
  )
    findings.push("legacy deletion binding model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:Instance|InstanceToolPolicy|ToolInvocation)\b/.test(source)
  )
    findings.push("legacy instance/tool policy model");
  if (
    filePath === "prisma/models/agents.prisma" &&
    /model\s+Agent(?:PolicySnapshot|AuthorityProfileVersion|ExecutionDispatchOutbox|AuthorizationEvent|ApprovalRequest)\b/.test(
      source,
    )
  )
    findings.push("legacy authority/grant/outbox model");
  if (
    /^(?:apps\/server\/\.env\.example|(?:deploy|docker|infra|\.github\/workflows)\/|docker-compose(?:\.[^/]+)?\.ya?ml$)/.test(
      filePath,
    ) &&
    /(?:AGENT_GATEWAY|GATEWAY_URL|KIDITEM_MCP_EXECUTION_CONTEXT|(?:INTERACTION|AGENT_RUNTIME_CREDENTIAL)_[A-Z_]*HMAC_KEY|AGENT_RUNTIME_WORKER_ENABLED|agentGateway)/.test(
      source,
    )
  )
    findings.push("legacy gateway configuration");
  return findings.map((finding) => `${filePath}: ${finding}`);
}

export function collectAgentOsContractionFindings(files) {
  return files.flatMap(findingsFor);
}

export function contractionRoots(root) {
  return [
    path.join(root, "apps/server/src/agent-os"),
    path.join(root, "apps/server/.env.example"),
    path.join(root, "apps/web/src"),
    path.join(root, "apps/web/next.config.mjs"),
    path.join(root, "packages/shared/src"),
    path.join(root, "prisma/models"),
    path.join(root, "deploy"),
    path.join(root, "docker"),
    path.join(root, "infra"),
    path.join(root, ".github/workflows"),
    path.join(root, "docker-compose.yml"),
  ];
}

function main() {
  const mode = process.argv.includes("--enforce") ? "enforce" : "report";
  if (!process.argv.includes("--report") && mode !== "enforce")
    throw new Error("Use --report or --enforce");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = collectAgentOsContractionFindings(
    contractionRoots(root)
      .flatMap(productionFiles)
      .map((file) => ({
        path: path.relative(root, file),
        source: readFileSync(file, "utf8"),
      })),
  );
  console.log(
    `check:agent-os-contraction ${mode.toUpperCase()} (${findings.length} findings)`,
  );
  for (const finding of findings) console.log(`- ${finding}`);
  if (mode === "enforce" && findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
