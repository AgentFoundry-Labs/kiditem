import type { AgentSkillDefinitionRecord } from './agent-os.types';

const SKILLS: readonly AgentSkillDefinitionRecord[] = [
  {
    key: 'sourcing.magic_scraper',
    name: 'Magic Scraper',
    description:
      'Develop, repair, and harden Sourcing browser extractors from authorized local Chrome CDP page evidence.',
    category: 'sourcing',
    version: '1.0.0',
    skillPath: '~/.codex/skills/magic-scraper/SKILL.md',
    defaultPreload: false,
    allowedAgentTypes: ['sourcing'],
    mode: 'development_workflow',
  },
  {
    key: 'sourcing.evidence-grounded-analysis',
    name: 'Evidence-grounded analysis',
    description: 'Answer sourcing questions only from run-scoped KidItem evidence.',
    category: 'sourcing',
    version: '1.0.0',
    skillPath:
      'agent-config/skills/sourcing/evidence-grounded-analysis/SKILL.md',
    defaultPreload: true,
    allowedAgentTypes: ['sourcing'],
    mode: 'runtime_playbook',
  },
  {
    key: 'sourcing.collection-planning',
    name: 'Collection planning',
    description: 'Refresh sourcing data through bounded deterministic Operations.',
    category: 'sourcing',
    version: '1.0.0',
    skillPath: 'agent-config/skills/sourcing/collection-planning/SKILL.md',
    defaultPreload: true,
    allowedAgentTypes: ['sourcing'],
    mode: 'runtime_playbook',
  },
  {
    key: 'sourcing.safe-review-handoff',
    name: 'Safe review handoff',
    description: 'Keep Sourcing terminal at explicit review selection.',
    category: 'sourcing',
    version: '1.0.0',
    skillPath: 'agent-config/skills/sourcing/safe-review-handoff/SKILL.md',
    defaultPreload: true,
    allowedAgentTypes: ['sourcing'],
    mode: 'runtime_playbook',
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
