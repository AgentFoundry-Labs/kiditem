import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DETAIL_PAGE_REVISION_TYPES,
  DetailPageRevisionTypeSchema,
} from './detail-page-revision-type';

const REPO = resolve(__dirname, '../../../../../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path);
    return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
  });
}

/**
 * `DetailPageRevision.revisionType` 을 쓰는 곳 전부의 값: 서버 writer 는 상수의 키로, 데이터 이관은 상수의
 * 키나 SQL 문자열로, 스키마는 기본값으로 쓴다. 이 집합이 상수와 같아야 한다 — 없는 값을 쓰는 writer 도,
 * 아무도 쓰지 않는 값도 없다. 이미 닫힌 열차의 이관(`v0.1.1`)은 옛 표(`detail_page_artifacts`)에 쓰던 역사라
 * 세지 않는다 — 그 값의 행은 ADR-0010 cutover 로 사라졌다(KID-313 W3b).
 */
const CLOSED_TRAIN_MIGRATIONS = /scripts\/data-migrations\/v0\.1\.1\//;
function writtenRevisionTypes(): { value: string; writer: string }[] {
  const written: { value: string; writer: string }[] = [];
  const files = [
    ...sourceFiles(join(REPO, 'apps/server/src')),
    ...sourceFiles(join(REPO, 'scripts/data-migrations')).filter((file) => !CLOSED_TRAIN_MIGRATIONS.test(relative(REPO, file))),
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const writer = relative(REPO, file);
    for (const match of text.matchAll(/DETAIL_PAGE_REVISION_TYPE\.([a-z_]+)/g)) {
      written.push({ value: match[1]!, writer });
    }
    for (const match of text.matchAll(/revisionType:\s*'([^']*)'/g)) {
      written.push({ value: `literal:${match[1]}`, writer });
    }
    // 옛 이관의 SQL 은 값을 문자열로 적는다(넣은 값을 같은 문자열로 다시 찾는다).
    for (const match of text.matchAll(/revision_type\s*=\s*'([^']*)'/g)) {
      written.push({ value: match[1]!, writer });
    }
  }
  const schema = readFileSync(join(REPO, 'prisma/models/ai.prisma'), 'utf8');
  const fallback = /revisionType\s+String\s+@default\("([^"]+)"\)/.exec(schema);
  if (fallback) written.push({ value: fallback[1]!, writer: 'prisma/models/ai.prisma @default' });
  return written;
}

describe('detail-page revision types', () => {
  it('are exactly the values every revision writer uses, and server writers use the constant', () => {
    const written = writtenRevisionTypes();

    expect(written.filter((entry) => entry.value.startsWith('literal:'))).toEqual([]);
    expect([...new Set(written.map((entry) => entry.value))].sort()).toEqual([...DETAIL_PAGE_REVISION_TYPES].sort());
  });

  it('rejects a revision type no writer produces', () => {
    expect(DetailPageRevisionTypeSchema.safeParse('manual_edit').success).toBe(true);
    expect(DetailPageRevisionTypeSchema.safeParse('legacy_edited_html_backfill').success).toBe(false);
  });
});
