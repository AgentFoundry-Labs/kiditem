import { z } from 'zod';

export const SOURCING_CANDIDATE_STATUSES = ['sourced', 'promoted', 'rejected'] as const;

export const SourcingCandidateStatusSchema = z.enum(SOURCING_CANDIDATE_STATUSES);

export type SourcingCandidateStatus = z.infer<typeof SourcingCandidateStatusSchema>;
