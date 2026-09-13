#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SOURCE_OWNER_MANIFEST =
  "extensions/kiditem-os/background/source-owner-manifest.js";
const EXTENSION_BACKGROUND_ROOT = "extensions/kiditem-os/background";
const READ_ONLY_PREFLIGHT_PATH =
  "scripts/operation-automation-cutover-preflight.mjs";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".secrets",
  ".venv",
  ".worktrees",
  "__tests__",
  "coverage",
  "dist",
  "e2e",
  "evals",
  "fixtures",
  "generated",
  "graphify-out",
  "node_modules",
  "__mocks__",
  "__snapshots__",
  "test",
  "test-fixtures",
  "test-helpers",
  "tests",
]);

const PRODUCTION_EXTENSIONS = new Set([
  ".cjs",
  ".conf",
  ".json",
  ".js",
  ".mjs",
  ".ps1",
  ".prisma",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const EXTENSION_PRODUCER_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
]);

const TEST_FILE = /(?:^|\.)(?:spec|test)\.[^.]+$/i;
const GENERATED_FILE = /(?:^|[._-])generated(?:[._-]|$)/i;
const PRODUCER_VALUE = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/i;
const SOURCE_OWNER_DOMAINS = new Set([
  "advertising",
  "analytics",
  "channels",
  "finance",
  "inventory",
  "orders",
  "sourcing",
  "supply",
]);
const SOURCE_OWNER_DISPOSITIONS = new Set([
  ...SOURCE_OWNER_DOMAINS,
  "DELETE",
]);

// Server source keeps Coupang browser-owner paths, but no domain may grow a
// second server-side OpenAPI client. Browser Wing URLs and internal HTTP paths
// are intentionally not included here.
const COUPANG_SERVER_OPENAPI_PATTERNS = [
  /\bCOUPANG_PROVIDER_PORT\b/g,
  /\bCoupangProviderPort\b/g,
  /\bcoupangRequest\s*\(/g,
  /\bcoupang-client\b/gi,
  /\bCoupang(?:OpenApi|Api|Client)[A-Za-z0-9_]*\b/g,
  /\bcoupang(?:OpenApi|Api)?Client\b/gi,
  /\/v2\/providers\/openapi\//gi,
  /\bapi-gateway\.coupang\.com\b/gi,
  /\bCoupangCredentials\b/g,
  /\bCOUPANG_[A-Z0-9_]*CREDENTIALS?\b/g,
  /\bresolveCoupangCredentials\b/g,
];

/**
 * The hard cutover deliberately keeps this list explicit. Broad searches for
 * words such as "operation" or "marketplace" would report live commerce
 * concepts that are unrelated to the retired Automation execution plane.
 */
const LEGACY_TOKEN_PATTERNS = [
  /\bOperationRun(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\bBrowserCollection(?:RunId|IssueResponse)(?:Schema)?\b/g,
  /\bOperationRunner(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\bOperationSchedule(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\bOperationAlert(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\boperationRuns?\b/g,
  /\boperationRun(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\boperationSchedules?\b/g,
  /\boperationAlerts?\b/g,
  /\bWorkflow(?:Template|Run|StepRun|Node|Runner|Orchestration|Orchestrator|Definition|Execution)(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\bActionTask(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\bactionTasks?\b/g,
  /\bOPERATION_RUNNER_PORT\b/g,
  /\bProductAbcPublicationState\b/g,
  /\bMAX_PUBLICATION_ATTEMPTS\b/g,
  /\bwithinActiveOperationAttemptFence\b/g,
  /\brequestedRevision\b/g,
  /\brecalculatedRevision\b/g,
  /\bpopulationHash\b/g,
  /\breliabilityAdjustment\b/g,
  /\bmarkDirty\b/g,
  /\brestartCollectionSession\b/g,
  /\bfinalizeCollectionSession\b/g,
  /\bOperationCancellation(?:[A-Z][A-Za-z0-9_]*)?\b/g,
  /\boperationCancellation\b/g,
  /\brunOperation\b/g,
  /\/api\/ads\/extension\/sync(?=[\/?#'"`\s),}]|$)/gi,
  /\b(?:PanelSnapshot|PanelProjection|PanelStream|PanelSse|usePanelStream|panelStore|panelRecovery|panelSseClient)\b/g,
  /\boperation[-_]runtime(?:[-_][a-z0-9]+)*\b/gi,
  /\/api\/(?:operation-alerts|operation-runs?|operations|workflow-runs?|workflows|marketplace|panel|action-board)(?=[/?#'"`\s),}]|$)/gi,
];

function isIgnoredDirectory(name) {
  return IGNORED_DIRECTORIES.has(name) || name.toLowerCase() === "docs";
}

function isProductionFile(name, extensions = PRODUCTION_EXTENSIONS) {
  if (name === "Dockerfile") return true;
  if (name.endsWith(".d.ts")) return false;
  if (TEST_FILE.test(name) || GENERATED_FILE.test(name)) return false;
  return extensions.has(path.extname(name).toLowerCase());
}

function productionFiles(directory, extensions = PRODUCTION_EXTENSIONS) {
  if (!existsSync(directory)) return [];
  const stat = statSync(directory);
  if (stat.isFile()) {
    return isProductionFile(path.basename(directory), extensions)
      ? [directory]
      : [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (entry.isDirectory() && !isIgnoredDirectory(entry.name)) {
        return productionFiles(path.join(directory, entry.name), extensions);
      }
      if (entry.isFile() && isProductionFile(entry.name, extensions)) {
        return [path.join(directory, entry.name)];
      }
      return [];
    });
}

function relativePath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

/**
 * Replace comments with spaces while preserving strings and line breaks. The
 * scanner intentionally operates on source text, but comments and docs are
 * not executable declarations or references.
 */
function withoutComments(source) {
  const output = [...source];
  let state = "code";

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (current === "\n" || current === "\r") {
        state = "code";
      } else {
        output[index] = " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        output[index] = " ";
        output[index + 1] = " ";
        index += 1;
        state = "code";
      } else if (current !== "\n" && current !== "\r") {
        output[index] = " ";
      }
      continue;
    }

    if (state === "single-quote" || state === "double-quote" || state === "template") {
      if (current === "\\") {
        index += 1;
        continue;
      }
      if (
        (state === "single-quote" && current === "'") ||
        (state === "double-quote" && current === '"') ||
        (state === "template" && current === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (current === "/" && next === "/") {
      output[index] = " ";
      output[index + 1] = " ";
      index += 1;
      state = "line-comment";
      continue;
    }
    if (current === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      index += 1;
      state = "block-comment";
      continue;
    }
    if (current === "'") {
      state = "single-quote";
    } else if (current === '"') {
      state = "double-quote";
    } else if (current === "`") {
      state = "template";
    }
  }

  return output.join("");
}

function decodeString(value, quote) {
  return value
    .replaceAll(/\\([\\'"`])/g, "$1")
    .replaceAll(/\\n/g, "\n")
    .replaceAll(/\\r/g, "\r")
    .replaceAll(/\\t/g, "\t")
    .replaceAll(new RegExp(`\\\\${quote}`, "g"), quote);
}

function readStringAt(source, start) {
  const quote = source[start];
  if (quote !== "'" && quote !== '"' && quote !== "`") return null;

  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const current = source[index];
    if (current === "\\") {
      value += current;
      if (index + 1 < source.length) {
        value += source[index + 1];
        index += 1;
      }
      continue;
    }
    if (current === quote) {
      return {
        end: index + 1,
        value: decodeString(value, quote),
      };
    }
    value += current;
  }
  return null;
}

function stringRanges(source) {
  const ranges = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "'" && source[index] !== '"' && source[index] !== "`") {
      continue;
    }
    const literal = readStringAt(source, index);
    if (!literal) continue;
    ranges.push([index, literal.end]);
    index = literal.end - 1;
  }
  return ranges;
}

function positionInStringRanges(position, ranges) {
  return ranges.some(([start, end]) => position >= start && position < end);
}

function skipWhitespace(source, index) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function matchingBracket(source, start, opening = "[", closing = "]") {
  if (source[start] !== opening) return -1;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const current = source[index];
    if (current === "'" || current === '"' || current === "`") {
      const string = readStringAt(source, index);
      if (string) {
        index = string.end - 1;
        continue;
      }
    }
    if (current === opening) depth += 1;
    if (current === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function addProducerValue(values, value) {
  if (typeof value === "string" && PRODUCER_VALUE.test(value.trim())) {
    values.add(value.trim());
  }
}

function producerValuesFromFile(source, fileName) {
  const ast = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const values = new Set();

  function addLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) addProducerValue(values, node.text);
  }
  function addInitializerLiterals(node) {
    addLiteral(node);
    ts.forEachChild(node, addInitializerLiterals);
  }

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (node.name.text === "PRODUCER" || node.name.text.endsWith("_PRODUCER")) {
        addLiteral(node.initializer);
      }
      if (node.name.text === "PRODUCERS" || node.name.text.endsWith("_PRODUCERS")) {
        addInitializerLiterals(node.initializer);
      }
    }
    if (ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "producer") {
      addLiteral(node.initializer);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression: receiver, name } = node.expression;
      if (name.text === "beginWebCollection" ||
          (name.text === "add" && ts.isIdentifier(receiver) && receiver.text.endsWith("_PRODUCERS"))) {
        addLiteral(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
  return values;
}

function parseStringMap(source, assignmentName) {
  const masked = withoutComments(source);
  const ranges = stringRanges(masked);
  let assignment = masked.indexOf(assignmentName);
  while (assignment >= 0 && positionInStringRanges(assignment, ranges)) {
    assignment = masked.indexOf(assignmentName, assignment + assignmentName.length);
  }
  if (assignment < 0) return {};
  const objectStart = masked.indexOf("{", assignment);
  if (objectStart < 0) return {};
  const objectEnd = matchingBracket(masked, objectStart, "{", "}");
  if (objectEnd < 0) return {};

  const map = {};
  let cursor = objectStart + 1;
  while (cursor < objectEnd) {
    cursor = skipWhitespace(masked, cursor);
    while (masked[cursor] === ",") {
      cursor = skipWhitespace(masked, cursor + 1);
    }
    if (cursor >= objectEnd) break;

    let key;
    const keyLiteral = readStringAt(masked, cursor);
    if (keyLiteral && keyLiteral.end <= objectEnd) {
      key = keyLiteral.value;
      cursor = keyLiteral.end;
    } else {
      const keyMatch = /^[A-Za-z_$][\w$-]*/.exec(masked.slice(cursor));
      if (!keyMatch) break;
      key = keyMatch[0];
      cursor += key.length;
    }

    cursor = skipWhitespace(masked, cursor);
    if (masked[cursor] !== ":") break;
    cursor = skipWhitespace(masked, cursor + 1);
    const valueLiteral = readStringAt(masked, cursor);
    if (!valueLiteral || valueLiteral.end > objectEnd) break;
    map[key] = valueLiteral.value;
    cursor = valueLiteral.end;
    while (cursor < objectEnd && masked[cursor] !== ",") cursor += 1;
  }
  return map;
}

function compareLocations(left, right) {
  const leftMatch = /^(.*?):(\d+)(?::(.*))?$/.exec(left);
  const rightMatch = /^(.*?):(\d+)(?::(.*))?$/.exec(right);
  if (!leftMatch || !rightMatch) return left < right ? -1 : left > right ? 1 : 0;
  if (leftMatch[1] !== rightMatch[1]) {
    return leftMatch[1] < rightMatch[1] ? -1 : 1;
  }
  const lineDifference = Number(leftMatch[2]) - Number(rightMatch[2]);
  if (lineDifference !== 0) return lineDifference;
  const leftSuffix = leftMatch[3] ?? "";
  const rightSuffix = rightMatch[3] ?? "";
  return leftSuffix < rightSuffix ? -1 : leftSuffix > rightSuffix ? 1 : 0;
}

function productionSourceFiles(root) {
  return productionFiles(root).filter((absolutePath) => {
    const relative = relativePath(root, absolutePath);
    return relative !== "scripts/check-operation-automation-cutover.mjs";
  });
}

function collectUnownedProducers(root, owners) {
  const extensionRoot = path.join(root, EXTENSION_BACKGROUND_ROOT);
  const declared = new Set();
  for (const absolutePath of productionFiles(
    extensionRoot,
    EXTENSION_PRODUCER_EXTENSIONS,
  )) {
    if (relativePath(root, absolutePath) === SOURCE_OWNER_MANIFEST) continue;
    const source = readFileSync(absolutePath, "utf8");
    for (const producer of producerValuesFromFile(source, absolutePath)) declared.add(producer);
  }

  return [...declared]
    .filter(
      (producer) =>
        !Object.hasOwn(owners, producer) ||
        !SOURCE_OWNER_DISPOSITIONS.has(owners[producer]),
    )
    .sort();
}

const ABC_RECALCULATION_PATTERNS = [
  /\bproducts\.classify-grades\b/i,
  /\/api\/products\/abc\/recalculate\b/i,
  /\bproducts\.recalculate_profitability_abc\b/i,
  /\b(?:abc|product[-_]?abc|master[-_]?product[-_]?abc)[A-Za-z0-9_$-]*\s*\.\s*recalculat\w*\s*\(/i,
  /\b(?:abc|product[-_]?abc|master[-_]?product[-_]?abc)[A-Za-z0-9_$-]*\s*\[\s*['"`]recalculat\w*['"`]\s*\]\s*\(/i,
  /\brecalculat\w*(?:abc|product[-_]?abc|master[-_]?product[-_]?abc)\b/i,
];
const GENERIC_RECALCULATION = /\brecalculate\w*\s*\(/i;
const ABC_MARKER = /\b(?:abc|product[-_]?abc|master[-_]?product[-_]?abc|profitability[-_]?abc)\w*\b/i;

function hasAbcRecalculationReference(maskedLine, fileHasAbcMarker) {
  if (ABC_RECALCULATION_PATTERNS.some((pattern) => pattern.test(maskedLine))) {
    return true;
  }
  return fileHasAbcMarker && GENERIC_RECALCULATION.test(maskedLine);
}

function collectSourceToAbcReferences(root, owners) {
  const ownerDomains = new Set(
    Object.values(owners).filter((owner) => SOURCE_OWNER_DOMAINS.has(owner)),
  );
  const references = new Set();

  for (const owner of ownerDomains) {
    const roots = [
      path.join(root, "apps/server/src", owner),
      path.join(root, EXTENSION_BACKGROUND_ROOT, owner),
    ];
    for (const ownerRoot of roots) {
      for (const absolutePath of productionFiles(ownerRoot)) {
        const source = withoutComments(readFileSync(absolutePath, "utf8"));
        const lines = source.split(/\r\n|\r|\n/);
        const fileHasAbcMarker = ABC_MARKER.test(source);
        const filePath = relativePath(root, absolutePath);
        lines.forEach((line, index) => {
          if (hasAbcRecalculationReference(line, fileHasAbcMarker)) {
            references.add(`${filePath}:${index + 1}`);
          }
        });
      }
    }
  }

  return [...references].sort(compareLocations);
}

function collectLegacyReferences(root) {
  const references = new Set();
  for (const absolutePath of productionSourceFiles(root)) {
    const filePath = relativePath(root, absolutePath);
    // This exact script is a retained read-only inventory. Its SELECT-only
    // table names intentionally overlap retired runtime tokens; keep this
    // exception local to the runtime-token scan.
    if (filePath === READ_ONLY_PREFLIGHT_PATH) continue;
    let source = withoutComments(readFileSync(absolutePath, "utf8"));
    // The sourcing regression guard names forbidden calls in regex literals.
    // Ignore only those literals, not executable calls elsewhere in the file.
    if (filePath === "scripts/check-sourcing-long-running-actions.mjs") {
      const parsed = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const maskPattern = (node) => {
        if (ts.isRegularExpressionLiteral(node)) {
          const start = node.getStart(parsed);
          source = source.slice(0, start)
            + source.slice(start, node.end).replace(/[^\r\n]/g, " ")
            + source.slice(node.end);
        }
        ts.forEachChild(node, maskPattern);
      };
      maskPattern(parsed);
    }
    // Prisma files may still declare ActionTask until the KID-90 schema step
    // drops it. Runtime references stay forbidden; Channels' commerce model
    // names are not matched.
    const patterns = filePath.endsWith(".prisma")
      ? [
        ...LEGACY_TOKEN_PATTERNS.filter((pattern) => !pattern.source.includes("ActionTask") && !pattern.source.includes("actionTasks")),
        /\bMarketplace\b/g,
      ]
      : filePath.startsWith("apps/server/src/")
        ? [...LEGACY_TOKEN_PATTERNS, ...COUPANG_SERVER_OPENAPI_PATTERNS]
        : LEGACY_TOKEN_PATTERNS;
    const lines = source.split(/\r\n|\r|\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line))) {
          references.add(`${filePath}:${index + 1}:${match[0]}`);
          if (!pattern.global) break;
        }
      }
    });
  }
  return [...references].sort(compareLocations);
}

export async function scanOperationAutomationCutover(root) {
  const resolvedRoot = path.resolve(root);
  const manifestPath = path.join(resolvedRoot, SOURCE_OWNER_MANIFEST);
  const owners = existsSync(manifestPath)
    ? parseStringMap(readFileSync(manifestPath, "utf8"), "SOURCE_OWNER_BY_PRODUCER")
    : {};

  return {
    unownedProducers: collectUnownedProducers(resolvedRoot, owners),
    sourceToAbcReferences: collectSourceToAbcReferences(resolvedRoot, owners),
    legacyReferences: collectLegacyReferences(resolvedRoot),
  };
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function allFindings(result) {
  return [
    ...result.unownedProducers,
    ...result.sourceToAbcReferences,
    ...result.legacyReferences,
  ];
}

async function main() {
  const root = repoRoot();
  const result = await scanOperationAutomationCutover(root);
  const findings = allFindings(result);
  const status = findings.length === 0 ? "PASS" : "FAIL";
  console.log(`check:operation-automation-cutover ${status} (${findings.length} findings)`);
  console.log(`Unowned producers (${result.unownedProducers.length}):`);
  for (const finding of result.unownedProducers) console.log(`- ${finding}`);
  console.log(`Source-to-ABC references (${result.sourceToAbcReferences.length}):`);
  for (const finding of result.sourceToAbcReferences) console.log(`- ${finding}`);
  console.log(`Legacy runtime references (${result.legacyReferences.length}):`);
  for (const finding of result.legacyReferences) console.log(`- ${finding}`);
  if (findings.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`check:operation-automation-cutover ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
