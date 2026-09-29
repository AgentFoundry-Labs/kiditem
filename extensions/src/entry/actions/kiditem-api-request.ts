import { z } from 'zod';
import type { ApiPort } from '../../core/api';
import type { EntryAction } from '../../core/dispatch';

/**
 * `kiditemApiRequest`(내부 메시지, 팝업 → 확장, KID-366, 옛 `coupang/worker.js`에서 옮겼다). 팝업이 고른 환경의 KidItem API
 * `/api/...` 경로를 그 환경 토큰으로 부르고 상태와 JSON 본문을 돌려준다. 다른 주소는 받지 않고, 팝업이 실은 Authorization은 버린다.
 */
export const KIDITEM_API_REQUEST_ACTION = 'kiditemApiRequest' as const;

const MessageSchema = z.object({
  action: z.literal(KIDITEM_API_REQUEST_ACTION),
  environmentId: z.string().optional(),
  path: z.string().regex(/^\/api\//),
  init: z.object({
    method: z.string().max(10).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  }).optional(),
}).strict();

export function kiditemApiRequestAction(deps: { apiFor(environmentId: string): ApiPort }): EntryAction<z.infer<typeof MessageSchema>> {
  return {
    schema: MessageSchema,
    async handle(input, { environmentId }) {
      const headers = new Headers(input.init?.headers ?? {});
      headers.delete('authorization');
      const response = await deps.apiFor(environmentId).fetch(input.path, { ...input.init, headers });
      const body = await response.json().catch(() => null);
      return { success: true, ok: response.ok, status: response.status, body };
    },
  };
}
