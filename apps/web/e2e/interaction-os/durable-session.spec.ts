import { expect, test } from 'playwright/test';
import { createAgentInteractionAcceptanceHarness } from '../fixtures/agent-interaction-harness';

test('durable AgentOS session survives reload, reuses its canonical thread, and shares both surfaces', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror:${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
  });
  const harness = await createAgentInteractionAcceptanceHarness();
  try {
    await harness.authenticate(page, 'primary');
    await page.goto('/dashboard');
    await harness.openPanel(page);
    await harness.expectCanonicalCounts({ sessions: 0, executions: 0, events: 0, outbox: 0 });

    const firstThread = await harness.submit(page, '내 durable 세션을 시작해줘');
    await harness.expectFirstRunGraph(firstThread);

    await page.reload();
    await harness.openPanel(page, firstThread);
    await harness.expectReplayWithoutWrites(firstThread);

    await harness.submit(page, '이전 대화를 이어서 답해줘');
    await harness.expectContinuation(firstThread);
    await harness.expectReplayLiveBoundary(firstThread);

    const secondThread = await harness.startNewConversationAndSubmit(page, '별도의 새 대화');
    expect(secondThread).not.toBe(firstThread);
    await harness.expectSafeAnalyticsAndSourcingRenderer(page);
    await harness.expectSuggestionSendsOnce(page);
    await harness.expectFailedDispatchRetryKeepsSession(page, secondThread);
    await harness.expectAuthorizedNavigation(page);
    await harness.expectPanelAndWorkspaceShareThread(page, secondThread);
  } catch (error) {
    throw new Error(
      `durable interaction acceptance failed: ${String(error)} :: ${JSON.stringify({
        ...harness.diagnostics(),
        browserErrors,
      })}`,
    );
  } finally {
    await harness.close();
  }
});
