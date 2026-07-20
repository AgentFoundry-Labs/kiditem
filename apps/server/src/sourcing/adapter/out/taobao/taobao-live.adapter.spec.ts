import { afterEach, describe, expect, it, vi } from 'vitest';
import { signTopParams, TaobaoLiveAdapter } from './taobao-live.adapter';

const ORIGINAL_ENV = { ...process.env };

describe('TaobaoLiveAdapter', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it('reports the exact missing official TOP credentials', () => {
    delete process.env.TAOBAO_TOP_APP_KEY;
    delete process.env.TAOBAO_TOP_APP_SECRET;

    expect(new TaobaoLiveAdapter().readiness()).toEqual({
      configured: false,
      mode: 'official-api',
      missing: ['TAOBAO_TOP_APP_KEY', 'TAOBAO_TOP_APP_SECRET'],
    });
  });

  it('signs TOP requests and normalizes contents, items, and known live rooms', async () => {
    process.env.TAOBAO_TOP_APP_KEY = 'test-key';
    process.env.TAOBAO_TOP_APP_SECRET = 'test-secret';
    process.env.TAOBAO_TOP_BASE_URL = 'https://eco.test/router/rest';
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body));
      const unsigned = Object.fromEntries(params.entries());
      const sign = unsigned.sign;
      delete unsigned.sign;
      expect(sign).toBe(signTopParams(unsigned, 'test-secret'));

      if (params.get('method') === 'taobao.live.contents.query') {
        return jsonResponse({
          live_contents_query_response: {
            success: true,
            model: {
              data_json_str: JSON.stringify([{
                live_id: 'room-1',
                title: '문구 신상품 방송',
                anchor_name: '문구왕',
                view_count: 1234,
              }]),
            },
          },
        });
      }
      if (params.get('method') === 'taobao.live.items.query') {
        return jsonResponse({
          live_items_query_response: {
            success: true,
            model: {
              data_json_str: JSON.stringify({ items: [{
                live_id: 'room-1',
                item_id: 'item-9',
                item_title: '스티커 세트',
                price: '3.50',
                item_pic: 'https://img.test/item.jpg',
              }] }),
            },
          },
        });
      }
      return jsonResponse({
        live_batchlives_get_response: {
          result: {
            live_list: {
              live_video_do: [{
                live_id: 'room-1',
                room_status: 1,
                title: '문구 신상품 방송',
                total_view_count: 2000,
                simple_broad_caster: { account_id: 77, account_name: '문구왕' },
              }],
            },
          },
        },
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await new TaobaoLiveAdapter().collect({
      queryDate: '20260714',
      liveIds: ['room-1'],
      pageSize: 100,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.warnings).toEqual([]);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0]).toEqual(expect.objectContaining({
      broadcastId: 'room-1',
      broadcasterName: '문구왕',
    }));
    expect(result.products).toEqual([
      expect.objectContaining({
        broadcastId: 'room-1',
        productId: 'item-9',
        title: '스티커 세트',
        priceCny: 3.5,
      }),
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
