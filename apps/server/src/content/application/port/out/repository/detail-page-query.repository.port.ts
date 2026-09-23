export const DETAIL_PAGE_QUERY_REPOSITORY_PORT = Symbol(
  'DETAIL_PAGE_QUERY_REPOSITORY_PORT',
);

/**
 * 후보(sourcing candidate)에 저장된 "현재 상세페이지" HTML.
 *
 * 경로: content_workspaces(source_candidate_id)
 *   -> current_detail_page_revision_id
 *   -> (없으면) detail_page_artifacts.current_revision_id
 */
export interface CandidateDetailPageHtmlSnapshot {
  revisionId: string;
  artifactId: string;
  html: string;
  createdAt: Date;
}

export interface DetailPageQueryRepositoryPort {
  findWorkspaceCurrentDetailPageHtml(input: {
    contentWorkspaceId: string;
    organizationId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null>;
  /** 작업공간에 속한 상세 artifact 의 revision 하나(KID-321). 다른 작업공간 · 지운 artifact 의 것이면 null. */
  findWorkspaceDetailPageRevisionHtml(input: {
    organizationId: string;
    contentWorkspaceId: string;
    revisionId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null>;
  findDetailPageRevisionHtml(input: {
    organizationId: string;
    revisionId: string;
    artifactId: string;
  }): Promise<CandidateDetailPageHtmlSnapshot | null>;
}
