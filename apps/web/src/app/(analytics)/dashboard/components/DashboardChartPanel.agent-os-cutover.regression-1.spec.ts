import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('DashboardChartPanel Agent OS clean cutover', () => {
  it('does not request the retired AgentInstance endpoint', () => {
    // Regression: ISSUE-001 — Dashboard repeatedly called the removed AgentInstance API.
    // Found by /qa on 2026-08-26
    // Report: .gstack/qa-reports/qa-report-dashboard-2026-08-26.md
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/app/(analytics)/dashboard/components/DashboardChartPanel.tsx',
      ),
      'utf8',
    );

    expect(source).not.toContain('/api/agent-os/instances');
  });
});
