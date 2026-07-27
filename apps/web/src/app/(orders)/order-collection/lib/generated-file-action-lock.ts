export interface GeneratedFileActionLock {
  acquire: (fileIds: readonly string[]) => (() => void) | null;
  isLocked: (fileId: string) => boolean;
  lockedFileIds: () => string[];
}

/**
 * 같은 생성 파일의 전송·다운로드·삭제만 충돌시킨다. 서로 다른 파일은 독립적으로
 * 작업할 수 있고, acquire가 돌려준 release는 오래된 finally가 새 소유자를 풀지 못한다.
 */
export function createGeneratedFileActionLock(): GeneratedFileActionLock {
  const owners = new Map<string, symbol>();

  return {
    acquire(fileIds) {
      const ids = [...new Set(fileIds.filter((fileId) => fileId.length > 0))];
      if (ids.length === 0 || ids.some((fileId) => owners.has(fileId))) return null;
      const token = Symbol('generated-file-action');
      for (const fileId of ids) owners.set(fileId, token);
      return () => {
        for (const fileId of ids) {
          if (owners.get(fileId) === token) owners.delete(fileId);
        }
      };
    },
    isLocked(fileId) {
      return owners.has(fileId);
    },
    lockedFileIds() {
      return [...owners.keys()];
    },
  };
}
