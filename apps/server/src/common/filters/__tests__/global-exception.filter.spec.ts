import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { AppException } from '@kiditem/shared';
import { GlobalExceptionFilter } from '../global-exception.filter';

// ── Mocks ──

function makeHost(method = 'GET', url = '/api/test') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method, url };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost,
    status,
    json,
  };
}

function makePrismaError(code: string, message: string) {
  return { constructor: { name: 'PrismaClientKnownRequestError' }, code, message };
}

// ── Tests ──

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('AppException → extracts code + status + message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new AppException(422, 'ORDER_NO_SELECTION', '주문을 선택하세요'), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        error: 'ORDER_NO_SELECTION',
        message: '주문을 선택하세요',
        path: '/api/test',
      }),
    );
  });

  it('HttpException (object response) → maps error field', () => {
    const { host, status, json } = makeHost();
    filter.catch(new BadRequestException('Validation failed'), host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('Validation failed');
  });

  it('HttpException (array message) → joins messages', () => {
    const { host, json } = makeHost();
    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['field1 required', 'field2 invalid'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(json.mock.calls[0][0].message).toBe('field1 required, field2 invalid');
  });

  it('HttpException (string response) → uses string as message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new HttpException('Service down', 503), host);

    expect(status).toHaveBeenCalledWith(503);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('HTTP_503');
    expect(body.message).toBe('Service down');
  });

  it('PrismaClientKnownRequestError P2025 → 404 NOT_FOUND', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2025', 'Record not found\n\ndetail line'), host);

    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('COMMON_NOT_FOUND');
    expect(body.message).toBe('detail line');
  });

  it('PrismaClientKnownRequestError P2002 → 409 BAD_REQUEST', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2002', 'Unique constraint\n\nDuplicate entry'), host);

    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('COMMON_BAD_REQUEST');
    expect(body.message).toBe('Duplicate entry');
  });

  it('PrismaClientKnownRequestError other code → 500 DB_ERROR', () => {
    const { host, status, json } = makeHost();
    filter.catch(makePrismaError('P2003', 'Foreign key\n\nFK violation'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].error).toBe('COMMON_DB_ERROR');
  });

  it('plain Error → 500 INTERNAL with error message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('Something broke'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.error).toBe('COMMON_INTERNAL_ERROR');
    expect(body.message).toBe('Something broke');
  });

  it('all responses include timestamp and path', () => {
    const { host, json } = makeHost('POST', '/api/orders');
    filter.catch(new Error('test'), host);

    const body = json.mock.calls[0][0];
    expect(body.path).toBe('/api/orders');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
