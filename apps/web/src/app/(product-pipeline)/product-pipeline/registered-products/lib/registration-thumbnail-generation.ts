import { thumbnailGenerationHubHref } from '../../_shared/lib/product-pipeline-routes';
import { thumbnailSubjectQueryParams } from '../../_shared/lib/thumbnail-subject';
import type { RegistrationWorkspaceSummary } from '../../_shared/lib/registration-workspaces-api';
import {
  latestGenerationInput,
  registrationWorkspaceDetailHref,
  registrationWorkspaceThumbnail,
  registrationWorkspaceTitle,
} from './registration-workspace-view';

export function registrationWorkspaceThumbnailGenerationHref(
  workspace: RegistrationWorkspaceSummary,
  returnTo = registrationWorkspaceDetailHref(workspace),
): string {
  const input = latestGenerationInput(workspace);
  const rawDescription =
    typeof input.rawDescription === 'string' && input.rawDescription.trim()
      ? input.rawDescription.trim().slice(0, 500)
      : null;

  return thumbnailGenerationHubHref({
    productDescription: rawDescription,
    productName: registrationWorkspaceTitle(workspace),
    imageUrl: registrationWorkspaceThumbnail(workspace),
    returnTo,
    subjectParams: thumbnailSubjectQueryParams({
      kind: 'registration-workspace',
      workspaceId: workspace.id,
      targetMasterId: workspace.targetMasterId,
      sourceCandidateId: workspace.sourceCandidateId,
    }),
  });
}
