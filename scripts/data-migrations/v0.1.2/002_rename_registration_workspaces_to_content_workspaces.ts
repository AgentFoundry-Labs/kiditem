import type { DataMigration } from '../types';

export const renameRegistrationWorkspacesToContentWorkspaces: DataMigration = {
  id: 'v0.1.2:002_rename_registration_workspaces_to_content_workspaces',
  releaseVersion: '0.1.2',
  name: 'Rename registration workspace tables and foreign keys to content workspace',
  async run(tx) {
    const affected = await tx.$executeRaw`
      DO $$
      BEGIN
        IF to_regclass('public.registration_workspaces') IS NOT NULL
           AND to_regclass('public.content_workspaces') IS NULL THEN
          ALTER TABLE registration_workspaces RENAME TO content_workspaces;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'thumbnail_generations'
            AND column_name = 'registration_workspace_id'
        ) THEN
          ALTER TABLE thumbnail_generations
          RENAME COLUMN registration_workspace_id TO content_workspace_id;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'content_generations'
            AND column_name = 'registration_workspace_id'
        ) THEN
          ALTER TABLE content_generations
          RENAME COLUMN registration_workspace_id TO content_workspace_id;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'detail_page_artifacts'
            AND column_name = 'registration_workspace_id'
        ) THEN
          ALTER TABLE detail_page_artifacts
          RENAME COLUMN registration_workspace_id TO content_workspace_id;
        END IF;

        IF to_regclass('public.registration_workspaces_direct_title_unique') IS NOT NULL
           AND to_regclass('public.content_workspaces_direct_title_unique') IS NULL THEN
          ALTER INDEX registration_workspaces_direct_title_unique RENAME TO content_workspaces_direct_title_unique;
        END IF;
        IF to_regclass('public.registration_workspaces_candidate_title_unique') IS NOT NULL
           AND to_regclass('public.content_workspaces_candidate_title_unique') IS NULL THEN
          ALTER INDEX registration_workspaces_candidate_title_unique RENAME TO content_workspaces_candidate_title_unique;
        END IF;
        IF to_regclass('public.registration_workspaces_master_title_unique') IS NOT NULL
           AND to_regclass('public.content_workspaces_master_title_unique') IS NULL THEN
          ALTER INDEX registration_workspaces_master_title_unique RENAME TO content_workspaces_master_title_unique;
        END IF;
        IF to_regclass('public.registration_workspaces_organization_id_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_organization_id_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_organization_id_idx RENAME TO content_workspaces_organization_id_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_source_candidate_id_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_source_candidate_id_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_source_candidate_id_idx RENAME TO content_workspaces_source_candidate_id_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_target_master_id_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_target_master_id_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_target_master_id_idx RENAME TO content_workspaces_target_master_id_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_current_detail_page_artifact_id_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_current_detail_page_artifact_id_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_current_detail_page_artifact_id_idx RENAME TO content_workspaces_current_detail_page_artifact_id_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_current_detail_page_revision_id_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_current_detail_page_revision_id_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_current_detail_page_revision_id_idx RENAME TO content_workspaces_current_detail_page_revision_id_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_created_by_user_id_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_created_by_user_id_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_created_by_user_id_idx RENAME TO content_workspaces_created_by_user_id_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_organization_id_status_is_deleted_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_organization_id_status_is_deleted_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_organization_id_status_is_deleted_idx RENAME TO content_workspaces_organization_id_status_is_deleted_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_organization_id_normalized_title_status_is_deleted_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_organization_id_normalized_title_status_is_deleted_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_organization_id_normalized_title_status_is_deleted_idx RENAME TO content_workspaces_organization_id_normalized_title_status_is_deleted_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_organization_id_owner_type_normalized_title_status_is_deleted_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_organization_id_owner_type_normalized_title_status_is_deleted_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_organization_id_owner_type_normalized_title_status_is_deleted_idx RENAME TO content_workspaces_organization_id_owner_type_normalized_title_status_is_deleted_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_organization_id_source_candidate_id_status_is_deleted_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_organization_id_source_candidate_id_status_is_deleted_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_organization_id_source_candidate_id_status_is_deleted_idx RENAME TO content_workspaces_organization_id_source_candidate_id_status_is_deleted_idx;
        END IF;
        IF to_regclass('public.registration_workspaces_organization_id_target_master_id_status_is_deleted_idx') IS NOT NULL
           AND to_regclass('public.content_workspaces_organization_id_target_master_id_status_is_deleted_idx') IS NULL THEN
          ALTER INDEX registration_workspaces_organization_id_target_master_id_status_is_deleted_idx RENAME TO content_workspaces_organization_id_target_master_id_status_is_deleted_idx;
        END IF;

        IF to_regclass('public.thumbnail_generations_registration_workspace_id_idx') IS NOT NULL
           AND to_regclass('public.thumbnail_generations_content_workspace_id_idx') IS NULL THEN
          ALTER INDEX thumbnail_generations_registration_workspace_id_idx RENAME TO thumbnail_generations_content_workspace_id_idx;
        END IF;
        IF to_regclass('public.thumbnail_generations_org_registration_workspace_idx') IS NOT NULL
           AND to_regclass('public.thumbnail_generations_org_content_workspace_idx') IS NULL THEN
          ALTER INDEX thumbnail_generations_org_registration_workspace_idx RENAME TO thumbnail_generations_org_content_workspace_idx;
        END IF;
        IF to_regclass('public.thumbnail_generations_org_registration_workspace_deleted_idx') IS NOT NULL
           AND to_regclass('public.thumbnail_generations_org_content_workspace_deleted_idx') IS NULL THEN
          ALTER INDEX thumbnail_generations_org_registration_workspace_deleted_idx RENAME TO thumbnail_generations_org_content_workspace_deleted_idx;
        END IF;
        IF to_regclass('public.content_generations_registration_workspace_id_idx') IS NOT NULL
           AND to_regclass('public.content_generations_content_workspace_id_idx') IS NULL THEN
          ALTER INDEX content_generations_registration_workspace_id_idx RENAME TO content_generations_content_workspace_id_idx;
        END IF;
        IF to_regclass('public.content_generations_organization_id_registration_workspace_id_idx') IS NOT NULL
           AND to_regclass('public.content_generations_organization_id_content_workspace_id_idx') IS NULL THEN
          ALTER INDEX content_generations_organization_id_registration_workspace_id_idx RENAME TO content_generations_organization_id_content_workspace_id_idx;
        END IF;
        IF to_regclass('public.detail_page_artifacts_registration_workspace_id_idx') IS NOT NULL
           AND to_regclass('public.detail_page_artifacts_content_workspace_id_idx') IS NULL THEN
          ALTER INDEX detail_page_artifacts_registration_workspace_id_idx RENAME TO detail_page_artifacts_content_workspace_id_idx;
        END IF;
        IF to_regclass('public.detail_page_artifacts_organization_id_registration_workspace_id_idx') IS NOT NULL
           AND to_regclass('public.detail_page_artifacts_organization_id_content_workspace_id_idx') IS NULL THEN
          ALTER INDEX detail_page_artifacts_organization_id_registration_workspace_id_idx RENAME TO detail_page_artifacts_organization_id_content_workspace_id_idx;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_workspaces_organization_id_fkey') THEN
          ALTER TABLE content_workspaces RENAME CONSTRAINT registration_workspaces_organization_id_fkey TO content_workspaces_organization_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_workspaces_source_candidate_id_fkey') THEN
          ALTER TABLE content_workspaces RENAME CONSTRAINT registration_workspaces_source_candidate_id_fkey TO content_workspaces_source_candidate_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_workspaces_target_master_id_fkey') THEN
          ALTER TABLE content_workspaces RENAME CONSTRAINT registration_workspaces_target_master_id_fkey TO content_workspaces_target_master_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_workspaces_current_detail_page_artifact_id_fkey') THEN
          ALTER TABLE content_workspaces RENAME CONSTRAINT registration_workspaces_current_detail_page_artifact_id_fkey TO content_workspaces_current_detail_page_artifact_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_workspaces_current_detail_page_revision_id_fkey') THEN
          ALTER TABLE content_workspaces RENAME CONSTRAINT registration_workspaces_current_detail_page_revision_id_fkey TO content_workspaces_current_detail_page_revision_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registration_workspaces_created_by_user_id_fkey') THEN
          ALTER TABLE content_workspaces RENAME CONSTRAINT registration_workspaces_created_by_user_id_fkey TO content_workspaces_created_by_user_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'thumbnail_generations_registration_workspace_id_fkey') THEN
          ALTER TABLE thumbnail_generations RENAME CONSTRAINT thumbnail_generations_registration_workspace_id_fkey TO thumbnail_generations_content_workspace_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_generations_registration_workspace_id_fkey') THEN
          ALTER TABLE content_generations RENAME CONSTRAINT content_generations_registration_workspace_id_fkey TO content_generations_content_workspace_id_fkey;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'detail_page_artifacts_registration_workspace_id_fkey') THEN
          ALTER TABLE detail_page_artifacts RENAME CONSTRAINT detail_page_artifacts_registration_workspace_id_fkey TO detail_page_artifacts_content_workspace_id_fkey;
        END IF;
      END $$;
    `;

    return {
      affectedRows: Number(affected),
      details: {
        renamed: true,
      },
    };
  },
};
