import { apiClient } from '@/lib/api-client';
import { moveSafetyLabelImagesToEnd } from './detail-page-image-order';
import { cropImageWhitespaceUrlToFile } from './image-whitespace-crop';

const DETAIL_PAGE_IMAGE_UPLOAD_PATH = '/api/ai/detail-page/images';

export async function prepareGenerationImageUrls(imageUrls: string[]): Promise<string[]> {
  const prepared = await Promise.all(
    imageUrls.map(async (imageUrl, index) => {
      try {
        return await cropAndUploadGenerationImage(imageUrl, index);
      } catch (err) {
        console.warn('[generate] image whitespace crop failed, using original', err);
        return imageUrl;
      }
    }),
  );
  return moveSafetyLabelImagesToEnd(prepared);
}

async function cropAndUploadGenerationImage(imageUrl: string, index: number): Promise<string> {
  const file = await cropImageWhitespaceUrlToFile(
    imageUrl,
    `detail-page-image-${index + 1}.png`,
  );
  if (!file) return imageUrl;

  const formData = new FormData();
  formData.append('file', file);
  const result = await apiClient.upload<{ url: string }>(
    DETAIL_PAGE_IMAGE_UPLOAD_PATH,
    formData,
  );
  return result.url;
}

export function hasImageUrlChanges(before: string[], after: string[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((url, index) => url !== after[index]);
}
