import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Skills 서비스 — agent-config/skills/ 디렉토리의 스킬을
 * 에이전트 실행 시 임시 디렉토리에 symlink로 주입.
 *
 * Paperclip 패턴: buildSkillsDir → .claude/skills/ 에 symlink → --add-dir로 전달
 */
@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);
  private readonly skillsRoot: string;

  constructor() {
    // __dirname 기준으로 apps/server/agent-config/skills 를 찾음
    this.skillsRoot = path.resolve(__dirname, '..', '..', '..', 'agent-config', 'skills');
  }

  /**
   * 사용 가능한 스킬 목록 반환.
   */
  listAvailable(): string[] {
    if (!fs.existsSync(this.skillsRoot)) return [];
    return fs.readdirSync(this.skillsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(this.skillsRoot, d.name, 'SKILL.md')))
      .map(d => d.name);
  }

  /**
   * 에이전트에게 필요한 스킬들을 임시 디렉토리에 주입.
   * 반환된 경로를 `claude --add-dir {path}` 로 전달.
   * 사용 후 cleanup()으로 삭제.
   */
  async buildSkillsDir(desiredSkills: string[]): Promise<string | null> {
    if (desiredSkills.length === 0) return null;

    const available = this.listAvailable();
    const toMount = desiredSkills.filter(s => available.includes(s));

    if (toMount.length === 0) return null;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiditem-skills-'));
    const targetDir = path.join(tmpDir, '.claude', 'skills');
    fs.mkdirSync(targetDir, { recursive: true });

    for (const skill of toMount) {
      const source = path.join(this.skillsRoot, skill);
      const target = path.join(targetDir, skill);
      try {
        fs.symlinkSync(source, target, 'dir');
      } catch (err) {
        this.logger.warn(`Failed to symlink skill ${skill}: ${err}`);
      }
    }

    this.logger.debug(`Built skills dir: ${tmpDir} (${toMount.join(', ')})`);
    return tmpDir;
  }

  /**
   * 임시 스킬 디렉토리 삭제.
   */
  cleanup(tmpDir: string): void {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn(`Failed to cleanup skills dir ${tmpDir}: ${err}`);
    }
  }
}
