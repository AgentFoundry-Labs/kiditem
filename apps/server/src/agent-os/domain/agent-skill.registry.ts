import type { AgentSkillDefinitionRecord } from './agent-os.types';

const SKILLS: readonly AgentSkillDefinitionRecord[] = [
  {
    key: 'sourcing.magic_scraper',
    name: 'Magic Scraper',
    description:
      'Develop, repair, and harden Sourcing browser extractors from authorized local Chrome CDP page evidence.',
    category: 'sourcing',
    version: '1.0.0',
    skillPath: 'tools/codex/skills/magic-scraper/SKILL.md',
    defaultPreload: true,
    allowedAgentTypes: ['sourcing'],
    mode: 'development_workflow',
  },
];

export function listAgentSkills(): AgentSkillDefinitionRecord[] {
  return SKILLS.map(cloneSkill);
}

export function findAgentSkillByKey(
  key: string,
): AgentSkillDefinitionRecord | null {
  const found = SKILLS.find((skill) => skill.key === key);
  return found ? cloneSkill(found) : null;
}

export function listAgentSkillsForAgentType(
  agentType: string,
): AgentSkillDefinitionRecord[] {
  return SKILLS.filter((skill) => skill.allowedAgentTypes.includes(agentType))
    .map(cloneSkill);
}

function cloneSkill(
  skill: AgentSkillDefinitionRecord,
): AgentSkillDefinitionRecord {
  return {
    ...skill,
    allowedAgentTypes: [...skill.allowedAgentTypes],
  };
}
