import { describe, expect, it } from 'vitest';
import { getImageDownloadFetchInit } from '../browser-download';

describe('getImageDownloadFetchInit', () => {
  it('does not attach credentials to data URLs', () => {
    expect(
      getImageDownloadFetchInit('data:image/png;base64,AAAA', 'https://kiditem.example'),
    ).toBeUndefined();
  });

  it('does not attach credentials to cross-origin public image URLs', () => {
    expect(
      getImageDownloadFetchInit(
        'https://gheoobctiarluauprvro.supabase.co/storage/v1/object/public/kiditem-staging-assets/image.jpg',
        'http://3.106.120.252',
      ),
    ).toBeUndefined();
  });

  it('includes credentials for same-origin API image URLs', () => {
    expect(
      getImageDownloadFetchInit('/api/assets/rendered-image.jpg', 'http://3.106.120.252'),
    ).toEqual({ credentials: 'include' });
  });
});
