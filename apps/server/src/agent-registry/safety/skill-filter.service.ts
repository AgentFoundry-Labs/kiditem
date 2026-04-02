import { Injectable } from '@nestjs/common';

@Injectable()
export class SkillFilterService {
  filterAndSort(requestedSkills: string[], deniedSkills: string[]): string[] {
    const denied = new Set(deniedSkills);
    return requestedSkills
      .filter(s => !denied.has(s))
      .sort();
  }
}
