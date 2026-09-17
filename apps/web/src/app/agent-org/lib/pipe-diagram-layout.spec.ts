import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_AGENT_GROUPS,
  DIAGRAM_AGENTS,
  DIAGRAM_EDGES,
  DIAGRAM_HEIGHT,
  DIAGRAM_NODES,
  DIAGRAM_TAB_HEIGHT,
  DIAGRAM_WIDTH,
  type DiagramRect,
} from './pipe-diagram-layout';
import { PIPE_STAGES } from './pipe-stages';

const withTab = (node: DiagramRect): DiagramRect => ({ ...node, y: node.y - DIAGRAM_TAB_HEIGHT, h: node.h + DIAGRAM_TAB_HEIGHT });
const overlaps = (a: DiagramRect, b: DiagramRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: DiagramRect, inner: DiagramRect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

describe('다이어그램 좌표', () => {
  it('⭐ 13단계와 주문이 빠짐없이, 한 박스에만 담긴다', () => {
    const placed = DIAGRAM_NODES.flatMap((node) => (node.kind === 'stage' ? [...node.stageIds] : []));
    expect([...placed].sort()).toEqual(PIPE_STAGES.map((stage) => stage.id).sort());
  });

  it('상세페이지 · 썸네일은 상품등록 박스 안에 함께 담긴다', () => {
    const register = DIAGRAM_NODES.find((node) => node.kind === 'stage' && node.stageIds.includes('register'));
    expect(register?.kind === 'stage' && register.stageIds).toEqual(['register', 'content']);
  });

  it('⭐ 위에서 아래로 내려온다 — 분석 → 1688 · 타오바오 → 사용자 컨펌 → 상품등록 → 주문', () => {
    const y = (stageId: string) =>
      DIAGRAM_NODES.find((node) => node.kind === 'stage' && node.stageIds.includes(stageId as never))!.y;
    expect(y('keyword')).toBeLessThan(y('supplier'));
    expect(y('supplier')).toBeLessThan(y('gate'));
    expect(y('gate')).toBeLessThan(y('register'));
    expect(y('register')).toBeLessThan(y('orders'));
  });

  it('⭐ 마케팅은 상품등록에서 내려와 릴스 → 블로그 → 광고 순서로 흐른다', () => {
    const node = (id: string) => DIAGRAM_NODES.find((candidate) => candidate.id === id)!;
    const register = node('register');
    const [reels, blog, ads] = [node('reels'), node('blog'), node('ads')];
    expect([reels, blog, ads].every((entry) => entry.agent === 'marketing')).toBe(true);
    expect(reels.y).toBeGreaterThan(node('orders').y);
    expect(reels.x).toBeLessThan(blog.x);
    expect(blog.x).toBeLessThan(ads.x);
    const down = DIAGRAM_EDGES.find((edge) => edge.id === 'register-reels')!;
    expect(down.points[0]![1]).toBe(register.y + register.h);
    expect(down.points[down.points.length - 1]![1]).toBe(reels.y);
    expect(DIAGRAM_EDGES.find((edge) => edge.id === 'reels-blog')?.to).toBe('blog');
    expect(DIAGRAM_EDGES.find((edge) => edge.id === 'blog-ads')?.to).toBe('ads');
  });

  it('⭐ 쇼핑몰 박스는 그림의 정가운데 세로 축에 선다', () => {
    const marketplaces = DIAGRAM_NODES.find((node) => node.id === 'marketplaces')!;
    expect(marketplaces.x + marketplaces.w / 2).toBe(DIAGRAM_WIDTH / 2);
    // 1688 · 사용자 컨펌 · 주문도 같은 축에 선다.
    for (const id of ['supplier', 'gate', 'orders']) {
      const node = DIAGRAM_NODES.find((candidate) => candidate.id === id)!;
      expect(node.x, id).toBe(marketplaces.x);
    }
  });

  it('⭐ 박스끼리(이름표 포함) 겹치지 않는다', () => {
    const rects = DIAGRAM_NODES.map(withTab);
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i]!, rects[j]!), `${DIAGRAM_NODES[i]!.id} ↔ ${DIAGRAM_NODES[j]!.id}`).toBe(false);
      }
    }
  });

  it('모든 박스와 선이 그림 안에 있다', () => {
    for (const node of DIAGRAM_NODES) {
      expect(node.x >= 0 && node.x + node.w <= DIAGRAM_WIDTH && node.y - DIAGRAM_TAB_HEIGHT >= 0 && node.y + node.h <= DIAGRAM_HEIGHT, node.id).toBe(true);
    }
    for (const edge of DIAGRAM_EDGES) {
      for (const [x, y] of edge.points) {
        expect(x >= 0 && x <= DIAGRAM_WIDTH && y >= 0 && y <= DIAGRAM_HEIGHT, edge.id).toBe(true);
      }
    }
  });

  it('⭐ 선은 가로 · 세로로만 꺾인다 — 대각선은 읽기 어렵다', () => {
    for (const edge of DIAGRAM_EDGES) {
      expect(edge.points.length, edge.id).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < edge.points.length; i += 1) {
        const [ax, ay] = edge.points[i - 1]!;
        const [bx, by] = edge.points[i]!;
        expect(ax === bx || ay === by, `${edge.id} #${i}`).toBe(true);
      }
    }
  });

  /** 단계 11(쇼핑몰 등록)과 바깥 쇼핑몰 박스가 같은 id 를 써서 화면 키가 부딪힌 적이 있다. */
  it('⭐ 박스 id 는 종류가 달라도 겹치지 않는다', () => {
    const ids = DIAGRAM_NODES.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('⭐ 모든 박스는 맡은 에이전트 틀 안에 들고, 다른 에이전트 틀에는 걸치지 않는다', () => {
    for (const node of DIAGRAM_NODES) {
      for (const group of DIAGRAM_AGENT_GROUPS) {
        if (group.id === node.agent) expect(contains(group, withTab(node)), `${node.id} ⊂ ${group.id}`).toBe(true);
        else expect(overlaps(group, withTab(node)), `${node.id} ↔ ${group.id}`).toBe(false);
      }
    }
  });

  it('⭐ 에이전트 틀끼리 겹치지 않고 그림 안에 있다 — 빈 에이전트도 없다', () => {
    expect(DIAGRAM_AGENT_GROUPS.map((group) => group.id)).toEqual(DIAGRAM_AGENTS.map((agent) => agent.id));
    for (const group of DIAGRAM_AGENT_GROUPS) {
      expect(DIAGRAM_NODES.some((node) => node.agent === group.id), group.id).toBe(true);
      expect(group.x >= 0 && group.y >= 0 && group.x + group.w <= DIAGRAM_WIDTH && group.y + group.h <= DIAGRAM_HEIGHT, group.id).toBe(true);
    }
    for (let i = 0; i < DIAGRAM_AGENT_GROUPS.length; i += 1) {
      for (let j = i + 1; j < DIAGRAM_AGENT_GROUPS.length; j += 1) {
        const a = DIAGRAM_AGENT_GROUPS[i]!;
        const b = DIAGRAM_AGENT_GROUPS[j]!;
        expect(overlaps(a, b), `${a.id} ↔ ${b.id}`).toBe(false);
      }
    }
  });

  it('에이전트 색이 서로 다르다 — 색으로 누구 일인지 구별한다', () => {
    const colors = DIAGRAM_AGENTS.map((agent) => agent.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('1688 · 타오바오 · 알리바바를 찾는 박스에 세 곳의 로고가 붙는다', () => {
    const supplier = DIAGRAM_NODES.find((node) => node.id === 'supplier');
    expect(supplier?.kind === 'stage' && supplier.tiles.map((tile) => tile.brand)).toEqual(['1688', 'taobao', 'alibaba']);
  });

  it('⭐ 사용자 컨펌은 텔레그램과 주고받는다', () => {
    const gate = DIAGRAM_NODES.find((node) => node.id === 'gate')!;
    const telegram = DIAGRAM_NODES.find((node) => node.id === 'telegram')!;
    const edge = DIAGRAM_EDGES.find((candidate) => candidate.id === 'gate-telegram')!;
    expect(edge.twoWay).toBe(true);
    expect(edge.points[0]).toEqual([gate.x + gate.w, gate.y + gate.h / 2]);
    expect(edge.points[edge.points.length - 1]).toEqual([telegram.x, telegram.y + telegram.h / 2]);
  });

  it('선 id 가 겹치지 않는다', () => {
    const ids = DIAGRAM_EDGES.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
