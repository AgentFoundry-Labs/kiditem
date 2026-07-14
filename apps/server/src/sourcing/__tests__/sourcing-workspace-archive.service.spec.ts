import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SourcingWorkspaceArchiveService } from '../application/service/sourcing-workspace-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';

function makeRepo() {
  return {
    runInTransaction: vi.fn((callback) => callback({ tx: true })),
    lockCandidate: vi.fn().mockResolvedValue(undefined),
    findCandidateState: vi.fn().mockResolvedValue({ id: CANDIDATE_ID, status: 'sourced' }),
    archiveSourcedWorkspace: vi.fn().mockResolvedValue({
      archivedCandidate: true,
      archivedCandidateImages: 2,
    }),
  };
}

function makePreparationGuard() {
  return {
    assertCandidateTerminalTransitionAllowed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAiArchive() {
  return {
    archiveSourcingWorkspace: vi.fn().mockResolvedValue({
      archivedContentGenerations: 1,
      archivedDetailPageArtifacts: 1,
      archivedContentAssets: 1,
      archivedThumbnailGenerations: 1,
    }),
  };
}

describe('SourcingWorkspaceArchiveService', () => {
  it('archives the candidate workspace and delegates AI artifacts inside one transaction', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T08:00:00.000Z'));
    try {
      const repo = makeRepo();
      const aiArchive = makeAiArchive();
      const preparations = makePreparationGuard();
      const service = new SourcingWorkspaceArchiveService(
        repo as never,
        aiArchive as never,
        preparations as never,
      );

      await expect(service.archive(CANDIDATE_ID, ORG)).resolves.toEqual({
        ok: true,
        archivedCandidateImages: 2,
        archivedContentGenerations: 1,
        archivedDetailPageArtifacts: 1,
        archivedContentAssets: 1,
        archivedThumbnailGenerations: 1,
      });

      expect(repo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(repo.lockCandidate).toHaveBeenCalledWith({ tx: true }, {
        id: CANDIDATE_ID,
        organizationId: ORG,
      });
      expect(preparations.assertCandidateTerminalTransitionAllowed).toHaveBeenCalledWith(
        { tx: true },
        { organizationId: ORG, sourceCandidateId: CANDIDATE_ID },
      );
      expect(repo.lockCandidate.mock.invocationCallOrder[0])
        .toBeLessThan(preparations.assertCandidateTerminalTransitionAllowed.mock.invocationCallOrder[0]);
      expect(preparations.assertCandidateTerminalTransitionAllowed.mock.invocationCallOrder[0])
        .toBeLessThan(repo.archiveSourcedWorkspace.mock.invocationCallOrder[0]);
      expect(repo.archiveSourcedWorkspace).toHaveBeenCalledWith({ tx: true }, {
        id: CANDIDATE_ID,
        organizationId: ORG,
        archivedAt: new Date('2026-05-15T08:00:00.000Z'),
      });
      expect(aiArchive.archiveSourcingWorkspace).toHaveBeenCalledWith({ tx: true }, {
        organizationId: ORG,
        sourceCandidateId: CANDIDATE_ID,
        archivedAt: new Date('2026-05-15T08:00:00.000Z'),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws NotFoundException when the active sourced candidate is missing', async () => {
    const repo = makeRepo();
    repo.findCandidateState.mockResolvedValueOnce(null);
    const aiArchive = makeAiArchive();
    const preparations = makePreparationGuard();
    const service = new SourcingWorkspaceArchiveService(
      repo as never,
      aiArchive as never,
      preparations as never,
    );

    await expect(service.archive(CANDIDATE_ID, ORG)).rejects.toBeInstanceOf(NotFoundException);
    expect(preparations.assertCandidateTerminalTransitionAllowed).not.toHaveBeenCalled();
    expect(repo.archiveSourcedWorkspace).not.toHaveBeenCalled();
    expect(aiArchive.archiveSourcingWorkspace).not.toHaveBeenCalled();
  });

  it('does not archive the candidate or AI workspace while a preparation blocks terminal state', async () => {
    const repo = makeRepo();
    const aiArchive = makeAiArchive();
    const preparations = makePreparationGuard();
    preparations.assertCandidateTerminalTransitionAllowed.mockRejectedValueOnce(
      new ConflictException('Candidate has an active product preparation.'),
    );
    const service = new SourcingWorkspaceArchiveService(
      repo as never,
      aiArchive as never,
      preparations as never,
    );

    await expect(service.archive(CANDIDATE_ID, ORG)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.archiveSourcedWorkspace).not.toHaveBeenCalled();
    expect(aiArchive.archiveSourcingWorkspace).not.toHaveBeenCalled();
  });
});
