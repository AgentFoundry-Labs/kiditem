import type { DataMigration } from '../types';

/**
 * 몰이 들고 있는 대표 사진을, 이미 받아 둔 수집 기록에서 리스팅으로 옮긴다.
 *
 * 쿠팡 Wing 상품 목록 수집은 처음부터 `primaryImageUrl` 을 읽어 왔는데(확장
 * `buildDiscoveryItems`), 발행이 그 값을 리스팅에 쓰지 않아 저장된 적이 없다. 그래서 상품
 * 화면이 글자 타일만 그렸다(활성 마스터 2,951건 중 사진 65건, 라이브 2026-09-17).
 *
 * 수집 기록(`channel_scrape_chunks` 의 `discovery_page`)에는 그 값이 그대로 남아 있어
 * 다시 수집하지 않고 채운다. 비어 있는 칸만 채우므로 여러 번 돌려도 같은 결과다.
 */
export const backfillChannelListingImageFromDiscoveryMigration: DataMigration = {
  id: 'v0.1.31:014_backfill_channel_listing_image_from_discovery',
  releaseVersion: '0.1.31',
  name: 'Backfill channel listing image URLs from stored Wing discovery pages',
  phase: 'post-schema',
  async run(tx) {
    const affectedRows = await tx.$executeRaw`
      WITH discovered AS (
        SELECT
          c.organization_id,
          item ->> 'externalProductId' AS external_id,
          item ->> 'primaryImageUrl' AS image_url,
          ROW_NUMBER() OVER (
            PARTITION BY c.organization_id, item ->> 'externalProductId'
            ORDER BY c.created_at DESC, c.id DESC
          ) AS recency
        FROM channel_scrape_chunks c
        CROSS JOIN LATERAL jsonb_array_elements(c.payload -> 'items') AS item
        WHERE c.kind = 'discovery_page'
          AND jsonb_typeof(c.payload -> 'items') = 'array'
          AND item ->> 'primaryImageUrl' IS NOT NULL
          AND item ->> 'externalProductId' IS NOT NULL
      )
      UPDATE channel_listings l
      SET image_url = d.image_url,
          updated_at = NOW()
      FROM discovered d
      WHERE d.recency = 1
        AND l.organization_id = d.organization_id
        AND l.external_id = d.external_id
        AND l.image_url IS NULL
    `;
    return {
      affectedRows,
      details: { source: 'channel_scrape_chunks.discovery_page' },
    };
  },
};
