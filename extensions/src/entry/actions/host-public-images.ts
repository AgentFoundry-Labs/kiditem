import { HostPublicImagesMessageSchema } from '@kiditem/shared/extension-actions';
import type { z } from 'zod';
import type { EntryAction } from '../../core/dispatch';
import { hostPublicImages } from '../../sites/kidsnote/image-host';

/** `hostPublicImages` — 우리 저장소 사진을 키즈노트 첨부 저장소에 올려 공개 주소를 받는다(한 번에 20장까지). */
export function hostPublicImagesAction(deps: { fetch(url: string, init?: RequestInit): Promise<Response> }): EntryAction<z.infer<typeof HostPublicImagesMessageSchema>> {
  return {
    schema: HostPublicImagesMessageSchema,
    async handle(input) {
      return { success: true, images: await hostPublicImages(deps, input.urls) };
    },
  };
}
