import { ValidationPipe } from '@nestjs/common';
import { expect, it } from 'vitest';
import { ImageEditBodyDto } from './image-edit.dto';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const DETAIL_PAGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

it('keeps the edited detail page id the editor sends as detailPageId', async () => {
  await expect(pipe.transform(
    { image_url: 'https://example.com/a.png', preset: 'custom', detailPageId: DETAIL_PAGE_ID },
    { type: 'body', metatype: ImageEditBodyDto },
  )).resolves.toMatchObject({ detailPageId: DETAIL_PAGE_ID });
});

it('rejects a detailPageId that is not a uuid', async () => {
  await expect(pipe.transform(
    { image_url: 'https://example.com/a.png', preset: 'custom', detailPageId: 'not-a-uuid' },
    { type: 'body', metatype: ImageEditBodyDto },
  )).rejects.toMatchObject({ status: 400 });
});
