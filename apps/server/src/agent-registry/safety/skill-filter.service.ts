import { Injectable } from '@nestjs/common';
import { classifyToolRequest } from '../permissions/classifier';
import type { ResolvedPermissions } from '../permissions/hierarchy.validator';

@Injectable()
export class SkillFilterService {
  filterAndSort(requestedSkills: string[], deniedSkills: string[]): string[] {
    const denied = new Set(deniedSkills);
    return requestedSkills
      .filter(s => !denied.has(s))
      .sort();
  }

  filterWithClassifier(
    skills: string[],
    deniedSkills: string[],
    resolved?: ResolvedPermissions,
  ): string[] {
    let filtered = this.filterAndSort(skills, deniedSkills);
    if (resolved) {
      filtered = filtered.filter(s => classifyToolRequest(s, resolved) === 'allow');
    }
    return filtered;
  }
}
