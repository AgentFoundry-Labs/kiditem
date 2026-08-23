import { expect, test } from 'playwright/test';
import { createAgentInteractionAcceptanceHarness } from '../fixtures/agent-interaction-harness';

test('durable AgentOS session survives reload, reuses its canonical thread, and shares both surfaces', async ({ page }) => {
  test.setTimeout(180_000);
  const stage = async <T>(name: string, action: () => Promise<T>, timeout = 20_000): Promise<T> => test.step(name, async () => {
    console.log(`[durable-session:e2e] START ${name}`);
    const result = await action();
    console.log(`[durable-session:e2e] PASS ${name}`);
    return result;
  }, { timeout });
  const browserErrors: string[] = [];
  const apiFailures: string[] = [];
  const copilotRequests: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror:${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) {
      apiFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/')) apiFailures.push(`failed ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/copilotkit')) {
      copilotRequests.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`);
    }
  });
  const harness = await stage('actual API root and web are ready', createAgentInteractionAcceptanceHarness, 60_000);
  try {
    await stage('authenticated dashboard opens panel', async () => {
      await harness.authenticate(page, 'primary');
      await page.goto('/dashboard');
      await harness.openPanel(page);
      await harness.expectCanonicalCounts({ sessions: 0, executions: 0, events: 0, outbox: 0 });
    });

    const firstThread = await stage('first submission creates canonical graph', async () => {
      const thread = await harness.submit(page, '내 durable 세션을 시작해줘');
      await harness.expectFirstRunGraph(thread);
      return thread;
    });

    await stage('reload replays without writes', async () => {
      await page.reload();
      await harness.openPanel(page, firstThread);
      await harness.expectReplayWithoutWrites(firstThread);
    });

    await stage('continuation preserves replay-live ordering', async () => {
      await harness.submit(page, '이전 대화를 이어서 답해줘');
      await harness.expectContinuation(firstThread);
      await harness.expectReplayLiveBoundary(firstThread);
    });
    await stage('approval survives panel close and reconnect', () => harness.expectDurableControlsAfterPanelClose(page), 40_000);
    await stage('partial in-process run is terminalized by actual API restart', () => harness.expectInProcessRunRecoveryAfterApiRestart(page), 60_000);
    await stage('panel reconnect replays without writes', () => harness.expectPanelReconnectWithoutWrites(page, firstThread));

    await stage('second thread renders and shares the selected session', async () => {
      const secondThread = await harness.startNewConversationAndSubmit(page, '별도의 새 대화');
      expect(secondThread).not.toBe(firstThread);
      await harness.expectSafeSourcingRenderer(page);
      await harness.expectSuggestionSendsOnce(page);
      await harness.expectFailedDispatchRetryKeepsSession(page, secondThread);
      await harness.expectAuthorizedNavigation(page);
      await harness.expectPanelAndWorkspaceShareThread(page, secondThread);
    }, 40_000);
  } catch (error) {
    throw new Error(
      `durable interaction acceptance failed: ${String(error)} :: ${JSON.stringify({
        ...harness.diagnostics(),
        browserErrors,
        apiFailures,
        copilotRequests,
        url: page.url(),
      })}`,
    );
  } finally {
    await harness.close();
  }
});
