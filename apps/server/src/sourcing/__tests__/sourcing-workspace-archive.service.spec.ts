import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SourcingWorkspaceArchiveService } from '../application/service/sourcing-workspace-archive.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_TX = { owner: true };

function makeRepo() {
  return {
    runInTransaction: vi.fn((callback) => callback({ tx: true }, OWNER_TX as never)),
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

/** 실행 장부는 Channels 울타리 것이다(ADR-0014). 후보 삭제 준비도 그쪽을 부른다. */
function makeExecutionFence() {
  return {
    cancelUnstartedExecutions: vi.fn().mockResolvedValue(0),
  };
}

/**
 * 콘텐츠 작업공간은 판매상품 초안 소유다(KID-310). 후보를 지우면 초안을 `unused` 로
 * 내리라고 Channels 에 부탁하고, AI 행 보관은 그쪽이 한다.
 */
function makeDrafts() {
  return {
    createFromSource: vi.fn(),
    findDraftIdForSource: vi.fn(),
    retireForSource: vi.fn().mockResolvedValue({
      salesProductId: 'draft-1', retired: true, blockedReason: null,
    }),
  };
}

describe('SourcingWorkspaceArchiveService', () => {
  it('archives the candidate workspace and sends its sales-product draft to unused', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T08:00:00.000Z'));
    try {
      const repo = makeRepo();
      const drafts = makeDrafts();
      const preparations = makePreparationGuard();
      const executions = makeExecutionFence();
      const service = new SourcingWorkspaceArchiveService(
        repo as never,
        preparations as never,
        executions as never,
        drafts as never,
      );

      await expect(service.archive(CANDIDATE_ID, ORG)).resolves.toEqual({
        ok: true,
        archivedCandidateImages: 2,
        draftRetired: true,
      });

      expect(repo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(repo.lockCandidate).toHaveBeenCalledWith({ tx: true }, {
        id: CANDIDATE_ID,
        organizationId: ORG,
      });
      expect(executions.cancelUnstartedExecutions).toHaveBeenCalledWith(
        OWNER_TX,
        {
          organizationId: ORG,
          sourceCandidateId: CANDIDATE_ID,
          cancelledAt: new Date('2026-05-15T08:00:00.000Z'),
        },
      );
      expect(preparations.assertCandidateTerminalTransitionAllowed).toHaveBeenCalledWith(
        OWNER_TX,
        { organizationId: ORG, sourceCandidateId: CANDIDATE_ID },
      );
      expect(repo.lockCandidate.mock.invocationCallOrder[0])
        .toBeLessThan(executions.cancelUnstartedExecutions.mock.invocationCallOrder[0]);
      expect(executions.cancelUnstartedExecutions.mock.invocationCallOrder[0])
        .toBeLessThan(preparations.assertCandidateTerminalTransitionAllowed.mock.invocationCallOrder[0]);
      expect(preparations.assertCandidateTerminalTransitionAllowed.mock.invocationCallOrder[0])
        .toBeLessThan(repo.archiveSourcedWorkspace.mock.invocationCallOrder[0]);
      expect(repo.archiveSourcedWorkspace).toHaveBeenCalledWith({ tx: true }, {
        id: CANDIDATE_ID,
        organizationId: ORG,
        archivedAt: new Date('2026-05-15T08:00:00.000Z'),
      });
      expect(drafts.retireForSource).toHaveBeenCalledWith(OWNER_TX, ORG, CANDIDATE_ID);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws NotFoundException when the active sourced candidate is missing', async () => {
    const repo = makeRepo();
    repo.findCandidateState.mockResolvedValueOnce(null);
    const drafts = makeDrafts();
    const preparations = makePreparationGuard();
    const executions = makeExecutionFence();
    const service = new SourcingWorkspaceArchiveService(
      repo as never,
      preparations as never,
      executions as never,
      drafts as never,
    );

    await expect(service.archive(CANDIDATE_ID, ORG)).rejects.toBeInstanceOf(NotFoundException);
    expect(preparations.assertCandidateTerminalTransitionAllowed).not.toHaveBeenCalled();
    expect(repo.archiveSourcedWorkspace).not.toHaveBeenCalled();
    expect(drafts.retireForSource).not.toHaveBeenCalled();
  });

  it('does not archive the candidate or retire its draft while a preparation blocks terminal state', async () => {
    const repo = makeRepo();
    const drafts = makeDrafts();
    const preparations = makePreparationGuard();
    const executions = makeExecutionFence();
    preparations.assertCandidateTerminalTransitionAllowed.mockRejectedValueOnce(
      new ConflictException('Candidate has an active product preparation.'),
    );
    const service = new SourcingWorkspaceArchiveService(
      repo as never,
      preparations as never,
      executions as never,
      drafts as never,
    );

    await expect(service.archive(CANDIDATE_ID, ORG)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.archiveSourcedWorkspace).not.toHaveBeenCalled();
    expect(drafts.retireForSource).not.toHaveBeenCalled();
  });
});
