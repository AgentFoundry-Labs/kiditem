/**
 * 대표이미지 생성 job 의 화면 상태(KID-313 W3a). job 은 상태만 갖고, "채택" 은 후보 자산 하나가 작업공간의
 * 대표이미지인지로 읽는다 — job 에 선택 · 적용 단계는 없다.
 */
type JobStatus = { status: string };
type JobCandidates = JobStatus & { candidates: readonly unknown[]; adoptedCandidate: unknown | null };

export const isThumbnailJobActive = (job: JobStatus): boolean =>
  job.status === 'pending' || job.status === 'running';

/** 결과가 나왔고 아직 어느 후보도 대표이미지로 채택되지 않았다. */
export const isThumbnailJobAwaitingAdoption = (job: JobCandidates): boolean =>
  job.status === 'succeeded' && job.candidates.length > 0 && job.adoptedCandidate === null;

/** 후보 하나가 작업공간의 대표이미지다. */
export const isThumbnailJobAdopted = (job: JobStatus & { adoptedCandidate: unknown | null }): boolean =>
  job.status === 'succeeded' && job.adoptedCandidate !== null;

export const isThumbnailJobEnded = (job: JobStatus): boolean =>
  job.status === 'failed' || job.status === 'cancelled';
