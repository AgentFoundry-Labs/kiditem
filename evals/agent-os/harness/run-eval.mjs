#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEvalCases } from '../contracts/eval-case.mjs';
import { parseEvalRunEvidence } from '../contracts/trial-evidence.mjs';
import { gradeEvalRun } from '../graders/business-outcome.mjs';

const evalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadCases() {
  return loadEvalCases({
    casesDir: path.join(evalRoot, 'cases'),
    fixturesPath: path.join(evalRoot, 'fixtures', 'fixtures.json'),
  });
}

function parsePromptVariables(args) {
  const variables = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (args[index] !== '--var' || typeof args[index + 1] !== 'string') {
      throw new Error('prompt variables use --var name=value');
    }
    const separator = args[index + 1].indexOf('=');
    if (separator < 1) throw new Error('prompt variables use --var name=value');
    const name = args[index + 1].slice(0, separator);
    const value = args[index + 1].slice(separator + 1);
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name) || value === '' || value.length > 2_000) {
      throw new Error(`invalid prompt variable: ${name}`);
    }
    if (variables.has(name)) throw new Error(`duplicate prompt variable: ${name}`);
    variables.set(name, value);
  }
  return variables;
}

function renderPrompt(evalCase, variables) {
  const usedVariables = new Set();
  const messages = evalCase.messages.map((message) => ({
    id: message.id,
    content: message.promptTemplate.replace(
      /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
      (_placeholder, name) => {
        if (!variables.has(name)) throw new Error(`missing prompt variable: ${name}`);
        usedVariables.add(name);
        return variables.get(name);
      },
    ),
  }));
  for (const name of variables.keys()) {
    if (!usedVariables.has(name)) throw new Error(`unused prompt variable: ${name}`);
  }
  return { caseId: evalCase.id, messages };
}

function main(args) {
  const cases = loadCases();
  if (args.length === 1 && args[0] === '--validate') {
    process.stdout.write(`validated ${cases.length} Agent OS eval cases\n`);
    return;
  }
  if (args.length === 1 && args[0] === '--list') {
    process.stdout.write(
      `${JSON.stringify(
        cases.map((evalCase) => ({
          id: evalCase.id,
          suite: evalCase.suite,
          fixtureId: evalCase.fixtureId,
          agentKey: evalCase.target.agentKey,
          provider: evalCase.target.provider,
          model: evalCase.target.model,
          effort: evalCase.target.effort,
          trials: evalCase.trials,
        })),
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (args.length === 2 && args[0] === '--grade') {
    const evidence = parseEvalRunEvidence(
      JSON.parse(readFileSync(path.resolve(args[1]), 'utf8')),
    );
    const evalCase = cases.find((candidate) => candidate.id === evidence.caseId);
    if (!evalCase) throw new Error(`unknown eval case: ${evidence.caseId}`);
    const summary = gradeEvalRun(evalCase, evidence);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.passed) process.exitCode = 1;
    return;
  }
  if (args.length >= 2 && args[0] === '--prompt') {
    const evalCase = cases.find((candidate) => candidate.id === args[1]);
    if (!evalCase) throw new Error(`unknown eval case: ${args[1]}`);
    const rendered = renderPrompt(evalCase, parsePromptVariables(args.slice(2)));
    process.stdout.write(`${JSON.stringify(rendered, null, 2)}\n`);
    return;
  }
  throw new Error(
    'Usage: run-eval.mjs --validate | --list | --prompt <case-id> [--var name=value] | --grade <evidence.json>',
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
