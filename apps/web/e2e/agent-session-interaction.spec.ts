import { expect, test } from 'playwright/test';
import { createAgentInteractionAcceptanceHarness } from './fixtures/agent-interaction-harness';

test('AgentOS interaction vertical slice is durable, replay-safe, and tenant-scoped', async ({ page }) => {
  const stage = async <T>(name: string, action: () => Promise<T>, timeout = 15_000) => test.step(
    name,
    async () => {
      console.log(`[agent-interaction:e2e] START ${name}`);
      const result = await action();
      console.log(`[agent-interaction:e2e] PASS ${name}`);
      return result;
    },
    { timeout },
  );
  const harness = await stage('disposable services are ready', createAgentInteractionAcceptanceHarness, 60_000);
  try {
    await stage('authenticated dashboard opens the interaction panel', async () => {
      await harness.authenticate(page, 'primary');
      await page.goto('/dashboard');
      const quickMenu = page.getByRole('button', { name: '퀵 메뉴 열기' });
      await quickMenu.click({ timeout: 12_000 }).catch(async (error) => {
        throw new Error(`dashboard shell missing: ${String(error)} :: ${await page.locator('body').innerText()} :: ${await page.evaluate(() => location.href)} :: console=${JSON.stringify(await harness.diagnostics())}`);
      });
      await page.getByRole('button', { name: 'AgentOS 대화 열기' }).click();
      await expect(page.getByRole('dialog', { name: 'AgentOS 대화' })).toBeVisible({ timeout: 10_000 });
    });
    await stage('open and agent selection perform zero writes', async () => {
      await harness.expectCanonicalCounts({ sessions: 0, executions: 0, events: 0, outbox: 0 });
      await page.getByLabel('에이전트').selectOption('operator');
      await harness.expectCanonicalCounts({ sessions: 0, executions: 0, events: 0, outbox: 0 });
    });

    const threadId = await stage('first submit creates the canonical graph', async () => {
      const selected = await harness.submit(page, '재고 현황 알려줘');
      await harness.expectFirstRunGraph(selected);
      await expect(page.getByText('재고 현황을 확인했습니다.')).toBeVisible({ timeout: 10_000 });
      return selected;
    });

    await stage('reload reconnects and replay performs zero writes', async () => {
      await page.reload();
      await harness.openPanel(page, threadId);
      await harness.expectReplayWithoutWrites(threadId);
    });
    await stage('reconnected thread accepts a later turn', async () => {
      await harness.submit(page, '후속 질문');
      await harness.expectContinuation(threadId);
      await harness.expectReplayLiveBoundary(threadId);
    });

    const secondThread = await stage('new conversation creates a distinct durable thread', async () => {
      const selected = await harness.startNewConversationAndSubmit(page, '새 대화');
      expect(selected).not.toBe(threadId);
      return selected;
    });
    await stage('projected tool results and terminal analytics are safe', () => (
      harness.expectSafeAnalyticsAndSourcingRenderer(page)
    ));
    await stage('latest suggestion sends once and consumes siblings', () => (
      harness.expectSuggestionSendsOnce(page)
    ));
    await stage('failure and retry keep the selected session', () => (
      harness.expectFailedDispatchRetryKeepsSession(page, secondThread)
    ));
    await stage('navigation authorizes actionId and follows an allowlisted route', () => (
      harness.expectAuthorizedNavigation(page)
    ));
    await stage('panel and workspace share the selected thread', () => (
      harness.expectPanelAndWorkspaceShareThread(page, secondThread)
    ));

    await stage('another organization cannot authorize the thread', async () => {
      await harness.authenticate(page, 'other-organization');
      await harness.expectSessionUnavailable(page, secondThread);
    });
  } finally {
    await harness.close();
  }
});
