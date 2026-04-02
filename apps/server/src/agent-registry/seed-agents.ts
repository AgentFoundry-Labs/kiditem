/**
 * 기본 에이전트 정의 시드.
 * 실행: npx ts-node apps/server/src/agent-registry/seed-agents.ts
 * 또는 서버 시작 시 AgentRegistryService.seedDefaults()로 호출.
 *
 * 정의 파일: agent-config/definitions.json
 * 프롬프트 파일: agent-config/prompts/{type}.md
 */

import * as fs from 'fs';
import * as path from 'path';

interface AgentDefinitionSeed {
  name: string;
  type: string;
  promptTemplate: string;
  [key: string]: unknown;
}

function loadDefinitions(): AgentDefinitionSeed[] {
  const configDir = path.join(process.cwd(), 'agent-config');
  const defsPath = path.join(configDir, 'definitions.json');

  if (!fs.existsSync(defsPath)) {
    throw new Error(`Agent definitions not found: ${defsPath}`);
  }

  const defs = JSON.parse(fs.readFileSync(defsPath, 'utf-8'));

  return defs.map((def: any) => {
    if (def.promptFile) {
      const promptPath = path.join(process.cwd(), def.promptFile);
      if (fs.existsSync(promptPath)) {
        def.promptTemplate = fs.readFileSync(promptPath, 'utf-8');
      } else {
        throw new Error(`Prompt file not found: ${promptPath}`);
      }
      delete def.promptFile;
    }
    return def;
  });
}

export const DEFAULT_AGENT_DEFINITIONS = loadDefinitions();
