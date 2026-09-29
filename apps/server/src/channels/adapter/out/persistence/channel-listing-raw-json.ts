import { Prisma } from '@prisma/client';

/**
 * The `raw_json` a `channel_listings` upsert stores when the incoming document
 * replaces the stored one.
 *
 * `createdOn` is the Wing registration date. Only the browser catalog's
 * inventory-list stage observes it, and Wing traffic publication reads it to
 * decide from which day a listing Wing left out of its report counts as zero
 * traffic. A replacement without a registration date of its own keeps the
 * stored one.
 */
export const listingRawJsonReplacementSql = Prisma.sql`
  CASE
    WHEN jsonb_typeof(channel_listings.raw_json -> 'createdOn') = 'string'
      AND jsonb_typeof(EXCLUDED.raw_json -> 'createdOn') IS DISTINCT FROM 'string'
    THEN COALESCE(EXCLUDED.raw_json, '{}'::jsonb)
      || jsonb_build_object('createdOn', channel_listings.raw_json -> 'createdOn')
    ELSE EXCLUDED.raw_json
  END
`;
