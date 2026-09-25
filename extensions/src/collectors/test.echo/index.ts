import type { Collector } from '../collector';
import { registerCollector } from '../index';

const CHUNKS = 2;
const ITEMS_PER_CHUNK = 3;

/**
 * 더미 kind `test.echo`(서버 owner는 `KIDITEM_TEST_OPERATION_KINDS=1`일 때만 등록).
 * 사이트 없이 청크 2장을 내 실행 계약이 begin → chunk → finish까지 도는지 본다.
 */
export const testEchoCollector: Collector = {
  kind: 'test.echo',
  site: null,
  async *collect(_plan, _site, { signal }) {
    for (let chunk = 1; chunk <= CHUNKS; chunk += 1) {
      if (signal.aborted) return;
      const at = new Date().toISOString();
      const payload = Array.from({ length: ITEMS_PER_CHUNK }, (_, index) => ({ i: (chunk - 1) * ITEMS_PER_CHUNK + index + 1, at }));
      yield { chunkKind: 'echo', payload, progress: { done: chunk } };
    }
  },
  summarize: () => ({ result: { echo: true } }),
};

registerCollector(testEchoCollector);
