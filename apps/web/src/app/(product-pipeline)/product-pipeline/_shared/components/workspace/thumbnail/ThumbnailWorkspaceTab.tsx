'use client';

import type { ProductEditState } from '../../../lib/product-workspace-types';

interface ThumbnailWorkspaceTabProps {
  editData: ProductEditState;
  productId: string;
  promotedMasterId: string | null;
  registrationWorkspaceId?: string | null;
  thumbnailSourceCandidateId?: string | null;
  selectedRegistrationThumbnailUrl: string | null;
  onSelectRegistrationThumbnail: (url: string | null) => void;
  onThumbnailsChange: (thumbnails: string[]) => void;
  thumbnailGenerationReturnHref: string;
}

export default function ThumbnailWorkspaceTab({
  selectedRegistrationThumbnailUrl,
}: ThumbnailWorkspaceTabProps) {
  return (
    <div className="p-5" data-testid="thumbnail-workspace-tab">
      {selectedRegistrationThumbnailUrl ?? 'none'}
    </div>
  );
}
