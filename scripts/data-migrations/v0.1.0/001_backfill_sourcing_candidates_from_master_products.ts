import type { DataMigration } from '../types';

export const backfillSourcingCandidatesFromMasterProducts: DataMigration = {
  id: 'v0.1.0:001_backfill_sourcing_candidates_from_master_products',
  releaseVersion: '0.1.0',
  name: 'Backfill SourcingCandidate history from deprecated MasterProduct sourcing columns',
  async run(tx) {
    const candidatesInserted = await tx.$executeRaw`
      WITH legacy_master_products AS (
        SELECT mp.*
        FROM master_products mp
        WHERE mp.source_url IS NOT NULL
          AND btrim(mp.source_url) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM sourcing_candidates sc
            WHERE sc.promoted_master_id = mp.id
          )
      )
      INSERT INTO sourcing_candidates (
        id,
        organization_id,
        source_url,
        source_platform,
        raw_data,
        name,
        description,
        category,
        tags,
        thumbnail_url,
        image_url,
        cost_cny,
        status,
        promoted_master_id,
        is_deleted,
        deleted_at,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        mp.organization_id,
        mp.source_url,
        COALESCE(NULLIF(mp.source_platform, ''), 'legacy'),
        COALESCE(mp.raw_data, '{}'::jsonb),
        mp.name,
        COALESCE(mp.description, ''),
        mp.category,
        COALESCE(mp.tags, '[]'::jsonb),
        mp.thumbnail_url,
        mp.image_url,
        mp.cost_cny,
        'promoted',
        mp.id,
        COALESCE(mp.is_deleted, false),
        mp.deleted_at,
        mp.created_at,
        mp.updated_at
      FROM legacy_master_products mp
    `;

    const candidateImagesInserted = await tx.$executeRaw`
      WITH promoted_candidates AS (
        SELECT sc.id AS candidate_id, sc.organization_id, sc.promoted_master_id
        FROM sourcing_candidates sc
        WHERE sc.promoted_master_id IS NOT NULL
      )
      INSERT INTO sourcing_candidate_images (
        id,
        organization_id,
        candidate_id,
        url,
        storage_key,
        role,
        label,
        sort_order,
        source,
        mime_type,
        width,
        height,
        file_size,
        is_primary,
        is_deleted,
        deleted_at,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        pci.organization_id,
        pci.candidate_id,
        mpi.url,
        mpi.storage_key,
        mpi.role,
        mpi.label,
        mpi.sort_order,
        COALESCE(NULLIF(mpi.source, ''), 'master-product'),
        mpi.mime_type,
        mpi.width,
        mpi.height,
        mpi.file_size,
        mpi.is_primary,
        mpi.is_deleted,
        mpi.deleted_at,
        mpi.created_at,
        mpi.updated_at
      FROM promoted_candidates pci
      JOIN master_product_images mpi
        ON mpi.master_id = pci.promoted_master_id
       AND mpi.organization_id = pci.organization_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM sourcing_candidate_images ci
        WHERE ci.candidate_id = pci.candidate_id
          AND ci.url = mpi.url
          AND ci.storage_key IS NOT DISTINCT FROM mpi.storage_key
          AND ci.role = mpi.role
          AND ci.sort_order = mpi.sort_order
          AND ci.is_deleted = mpi.is_deleted
      )
    `;

    return {
      affectedRows: candidatesInserted + candidateImagesInserted,
      details: { candidatesInserted, candidateImagesInserted },
    };
  },
};
