import { describe, expect, it, vi } from 'vitest';
import {
  applyChatCorsHeaders,
  handleChatCorsPreflight,
} from '../chat-cors';

function makeResponse() {
  const response = {
    statusCode: 200,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    end: vi.fn(),
  };
  return response;
}

describe('chat Copilot CORS helpers', () => {
  it('allows localhost preview origins in development preflight requests', () => {
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-headers': 'authorization,content-type',
      },
    };
    const res = makeResponse();

    const handled = handleChatCorsPreflight(req as never, res as never, {
      NODE_ENV: 'development',
    });

    expect(handled).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'http://localhost:3001',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Credentials',
      'true',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'authorization,content-type',
    );
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('uses CORS_ORIGINS as the production allowlist', () => {
    const req = {
      method: 'GET',
      headers: { origin: 'https://app.kiditem.test' },
    };
    const res = makeResponse();

    applyChatCorsHeaders(req as never, res as never, {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.kiditem.test',
    });

    expect(res.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://app.kiditem.test',
    );
  });

  it('does not allow unlisted production origins', () => {
    const req = {
      method: 'GET',
      headers: { origin: 'https://evil.example' },
    };
    const res = makeResponse();

    applyChatCorsHeaders(req as never, res as never, {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.kiditem.test',
    });

    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://evil.example',
    );
  });
});
