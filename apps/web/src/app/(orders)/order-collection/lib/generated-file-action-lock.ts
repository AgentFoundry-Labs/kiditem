export interface GeneratedFileActionLock {
  acquire: () => (() => void) | null;
  isLocked: () => boolean;
}

/**
 * 생성 파일의 전송·다운로드·삭제를 한 번에 하나만 실행한다.
 * acquire가 돌려준 release는 멱등이라 오래된 finally가 새 작업의 잠금을 풀 수 없다.
 */
export function createGeneratedFileActionLock(): GeneratedFileActionLock {
  let owner: symbol | null = null;

  return {
    acquire() {
      if (owner !== null) return null;
      const token = Symbol('generated-file-action');
      owner = token;
      return () => {
        if (owner === token) owner = null;
      };
    },
    isLocked() {
      return owner !== null;
    },
  };
}
