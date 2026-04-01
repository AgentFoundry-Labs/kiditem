import { describe, it, expect } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

describe('queryKeys', () => {
  // --- agents ---
  describe('agents', () => {
    it('all is base key', () => {
      expect(queryKeys.agents.all).toEqual(['agents']);
    });

    it('list extends all', () => {
      expect(queryKeys.agents.list()).toEqual(['agents', 'list']);
    });

    it('org extends all', () => {
      expect(queryKeys.agents.org()).toEqual(['agents', 'org']);
    });

    it('detail includes id', () => {
      expect(queryKeys.agents.detail('abc')).toEqual(['agents', 'detail', 'abc']);
    });

    it('runs includes id', () => {
      expect(queryKeys.agents.runs('abc')).toEqual(['agents', 'runs', 'abc']);
    });

    it('runtimeState includes id', () => {
      expect(queryKeys.agents.runtimeState('abc')).toEqual(['agents', 'runtimeState', 'abc']);
    });

    it('costAnalytics includes params', () => {
      const params = { from: '2026-01-01', to: '2026-01-31' };
      expect(queryKeys.agents.costAnalytics(params)).toEqual(['agents', 'costAnalytics', params]);
    });

    it('costAnalytics without params includes undefined', () => {
      expect(queryKeys.agents.costAnalytics()).toEqual(['agents', 'costAnalytics', undefined]);
    });

    it('list starts with all (hierarchy for invalidation)', () => {
      const list = queryKeys.agents.list();
      const all = queryKeys.agents.all;
      expect(list.slice(0, all.length)).toEqual([...all]);
    });
  });

  // --- workflows ---
  describe('workflows', () => {
    it('all is base key', () => {
      expect(queryKeys.workflows.all).toEqual(['workflows']);
    });

    it('list extends all', () => {
      expect(queryKeys.workflows.list()).toEqual(['workflows', 'list']);
    });

    it('detail includes id', () => {
      expect(queryKeys.workflows.detail('w1')).toEqual(['workflows', 'detail', 'w1']);
    });

    it('runs includes id', () => {
      expect(queryKeys.workflows.runs('w1')).toEqual(['workflows', 'runs', 'w1']);
    });

    it('runDetail includes runId', () => {
      expect(queryKeys.workflows.runDetail('r1')).toEqual(['workflows', 'runDetail', 'r1']);
    });
  });

  // --- marketplace ---
  describe('marketplace', () => {
    it('all is base key', () => {
      expect(queryKeys.marketplace.all).toEqual(['marketplace']);
    });

    it('workflows includes query', () => {
      const query = { module: 'sourcing' };
      expect(queryKeys.marketplace.workflows(query)).toEqual(['marketplace', 'workflows', query]);
    });

    it('workflows without query includes undefined', () => {
      expect(queryKeys.marketplace.workflows()).toEqual(['marketplace', 'workflows', undefined]);
    });

    it('agents includes query', () => {
      const query = { role: 'specialist', category: 'ads' };
      expect(queryKeys.marketplace.agents(query)).toEqual(['marketplace', 'agents', query]);
    });
  });

  // --- products ---
  describe('products', () => {
    it('all is base key', () => {
      expect(queryKeys.products.all).toEqual(['products']);
    });

    it('list includes params', () => {
      const params = { status: 'active' };
      expect(queryKeys.products.list(params)).toEqual(['products', 'list', params]);
    });

    it('detail includes id', () => {
      expect(queryKeys.products.detail('p1')).toEqual(['products', 'detail', 'p1']);
    });

    it('pipelineStats includes status', () => {
      expect(queryKeys.products.pipelineStats('active')).toEqual(['products', 'pipelineStats', 'active']);
    });
  });

  // --- factory functions return new arrays each call ---
  describe('identity', () => {
    it('factory functions return new arrays each call', () => {
      expect(queryKeys.agents.list()).not.toBe(queryKeys.agents.list());
      expect(queryKeys.workflows.list()).not.toBe(queryKeys.workflows.list());
      expect(queryKeys.agents.detail('x')).not.toBe(queryKeys.agents.detail('x'));
    });
  });

  // --- spot checks for other domains ---
  describe('other domains', () => {
    it('dashboard keys', () => {
      expect(queryKeys.dashboard.all).toEqual(['dashboard']);
      expect(queryKeys.dashboard.summary()).toEqual(['dashboard', 'summary']);
      expect(queryKeys.dashboard.trend('7d')).toEqual(['dashboard', 'trend', '7d']);
      expect(queryKeys.dashboard.health()).toEqual(['dashboard', 'health']);
    });

    it('orders keys', () => {
      expect(queryKeys.orders.all).toEqual(['orders']);
      expect(queryKeys.orders.pipeline()).toEqual(['orders', 'pipeline']);
    });

    it('sourcing keys', () => {
      expect(queryKeys.sourcing.all).toEqual(['sourcing']);
      expect(queryKeys.sourcing.detail('s1')).toEqual(['sourcing', 'detail', 's1']);
      expect(queryKeys.sourcing.preview('s1')).toEqual(['sourcing', 'preview', 's1']);
    });

    it('syncInfo is top-level key', () => {
      expect(queryKeys.syncInfo()).toEqual(['syncInfo']);
    });
  });
});
