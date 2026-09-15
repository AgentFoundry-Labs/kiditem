import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api-error';
import {
  handOffToExtensionRun,
  startWebOpenedCollection,
  type WebOpenedAttempt,
  type WebOpenedHandoff,
} from '../collection-start';
import { transferExtensionAuthTo } from '../extension-auth';
import { sendToExtension } from '../extension-bridge';

vi.mock('../extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
vi.mock('../extension-bridge', () => ({ detectExtensionId: vi.fn(), sendToExtension: vi.fn() }));

const EXTENSION_ID = 'order-extension';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDOFF_REFUSED = '확장 프로그램이 수집을 넘겨받지 못했습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.';
const HANDOFF_UNANSWERED = '확장 프로그램이 수집을 넘겨받지 않았습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.';
const HANDOFF_OTHER_RUN = '확장 프로그램이 다른 수집을 처리하느라 이 수집을 넘겨받지 못했습니다. 잠시 후 다시 시작해 주세요.';
const OTHER_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

describe('startWebOpenedCollection', () => {
  const events: string[] = [];
  let begin: (idempotencyKey: string) => Promise<WebOpenedAttempt>;
  let handOff: (handoff: WebOpenedHandoff) => Promise<void>;
  let cancel: (handoff: WebOpenedHandoff) => Promise<unknown>;

  function start() {
    return startWebOpenedCollection({
      detectExtension: async () => {
        events.push('detect');
        return EXTENSION_ID;
      },
      begin: (key) => {
        events.push('begin');
        return begin(key);
      },
      handOff: (handoff) => {
        events.push('handOff');
        return handOff(handoff);
      },
      cancel: (handoff) => {
        events.push('cancel');
        return cancel(handoff);
      },
    });
  }

  beforeEach(() => {
    events.length = 0;
    vi.mocked(transferExtensionAuthTo).mockImplementation(async () => {
      events.push('auth');
    });
    begin = async () => ({ outcome: 'opened', attemptId: ATTEMPT_ID, running: true });
    handOff = vi.fn(async () => undefined);
    cancel = vi.fn(async () => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('hands the opened attempt to the extension after the auth handoff and reports it started', async () => {
    const keys: string[] = [];
    begin = async (key) => {
      keys.push(key);
      return { outcome: 'opened', attemptId: ATTEMPT_ID, running: true };
    };

    await expect(start()).resolves.toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });

    expect(events).toEqual(['detect', 'auth', 'begin', 'handOff']);
    expect(transferExtensionAuthTo).toHaveBeenCalledWith(EXTENSION_ID);
    expect(keys).toEqual([expect.stringMatching(UUID)]);
    expect(handOff).toHaveBeenCalledWith({
      extensionId: EXTENSION_ID,
      attemptId: ATTEMPT_ID,
      idempotencyKey: keys[0],
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("reports the owner's running attempt without handing anything off", async () => {
    begin = async () => {
      throw new ApiError(409, 'Conflict', 'Conflict', {
        code: 'ATTEMPT_IN_PROGRESS',
        attemptId: ATTEMPT_ID,
      });
    };

    await expect(start()).resolves.toEqual({ outcome: 'running', attemptId: ATTEMPT_ID });
    expect(events).toEqual(['detect', 'auth', 'begin']);
  });

  it('hands nothing off for a replayed attempt that already ended, or for an owner refusal', async () => {
    begin = async () => ({ outcome: 'opened', attemptId: ATTEMPT_ID, running: false });
    await expect(start()).resolves.toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });

    begin = async () => ({ outcome: 'refused', message: '순위를 확인할 자사 상품이 없습니다.' });
    await expect(start()).resolves.toEqual({
      outcome: 'refused',
      message: '순위를 확인할 자사 상품이 없습니다.',
    });

    expect(events).not.toContain('handOff');
  });

  it('rethrows any other begin failure and opens nothing when the extension or its auth is unavailable', async () => {
    begin = async () => {
      throw new ApiError(500, 'ERROR', '서버 오류');
    };
    await expect(start()).rejects.toThrow('서버 오류');

    events.length = 0;
    vi.mocked(transferExtensionAuthTo).mockRejectedValueOnce(
      new Error('확장 프로그램에 로그인 정보를 넘기지 못했습니다. 잠시 후 다시 시도해 주세요.'),
    );
    await expect(start()).rejects.toThrow('확장 프로그램에 로그인 정보를 넘기지 못했습니다.');
    expect(events).toEqual(['detect']);
  });

  it("stops the attempt the extension did not take and rejects with the extension's reason", async () => {
    handOff = async () => {
      throw new Error('KidItem 로그인이 필요합니다.');
    };

    await expect(start()).rejects.toThrow('KidItem 로그인이 필요합니다.');

    expect(events).toEqual(['detect', 'auth', 'begin', 'handOff', 'cancel']);
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ attemptId: ATTEMPT_ID }));
  });

  it('gives a Korean reason for an English refusal and still rejects when the stop fails', async () => {
    handOff = async () => {
      throw new Error('Another Sellpia sales collection is running');
    };
    cancel = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(start()).rejects.toThrow(HANDOFF_REFUSED);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('handOffToExtensionRun', () => {
  const message = { action: 'collectSellpiaSaleSummary', attemptId: ATTEMPT_ID };
  const session = {
    attemptId: ATTEMPT_ID,
    producer: 'orders.sellpia_sales',
    progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
    attention: null,
  };
  let runReply: () => Promise<unknown>;
  let sessionReply: () => Promise<unknown>;

  beforeEach(() => {
    // The run answers only when its collection ends.
    runReply = () => new Promise(() => undefined);
    sessionReply = async () => null;
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, sent) => {
      const { action } = sent as { action: string };
      if (action === message.action) return runReply();
      if (action === 'getCollectionSession') return sessionReply();
      throw new Error(`unexpected extension action ${action}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("resolves once the extension shows the attempt's session while the run keeps going", async () => {
    vi.useFakeTimers();
    let reads = 0;
    sessionReply = async () => (++reads < 3 ? null : session);
    let settled = false;
    const handoff = handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(600);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    await handoff;

    expect(reads).toBe(3);
    expect(vi.mocked(sendToExtension).mock.calls.filter(([, sent]) =>
      (sent as { action: string }).action === message.action)).toEqual([
      [EXTENSION_ID, message, 190_000],
    ]);
    expect(sendToExtension).toHaveBeenCalledWith(
      EXTENSION_ID,
      { action: 'getCollectionSession', attemptId: ATTEMPT_ID },
      2_000,
    );
  });

  it('rejects with a Korean reason when the run answers before taking the attempt', async () => {
    runReply = async () => ({
      success: false,
      attemptId: ATTEMPT_ID,
      terminalState: 'RUNNING',
      continuationRequired: false,
      errorCode: 'COLLECTION_CANCELLED',
      error: 'Sellpia sales collection was cancelled.',
    });
    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).rejects.toThrow(HANDOFF_REFUSED);

    runReply = async () => ({ success: false, error: '셀피아 로그인이 필요합니다.' });
    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).rejects.toThrow(
      '셀피아 로그인이 필요합니다.',
    );
  });

  it('rejects with a Korean reason when the message cannot reach the extension', async () => {
    runReply = async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };

    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).rejects.toThrow(HANDOFF_REFUSED);
  });

  it('treats an answer for an attempt that already ended as handed off', async () => {
    runReply = async () => ({
      success: false,
      attemptId: ATTEMPT_ID,
      terminalState: 'FAILED',
      errorCode: 'SELLPIA_LOGIN_REQUIRED',
      error: 'Sellpia login is required.',
    });
    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).resolves.toBeUndefined();

    runReply = async () => ({ success: true, attemptId: ATTEMPT_ID, terminalState: 'COMPLETE' });
    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).resolves.toBeUndefined();
  });

  it("refuses an answer that names another attempt, even a finished one, as another run's answer", async () => {
    // An older run still active in this browser answers for its own attempt.
    runReply = async () => ({ success: true, attemptId: OTHER_ATTEMPT_ID, terminalState: 'COMPLETE' });
    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).rejects.toThrow(HANDOFF_OTHER_RUN);

    runReply = async () => ({
      success: false,
      attemptId: OTHER_ATTEMPT_ID,
      terminalState: 'FAILED',
      error: '쿠팡 윙 로그인이 필요합니다.',
    });
    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).rejects.toThrow(HANDOFF_OTHER_RUN);
  });

  it('hands over a message that names its attempt only through the session the extension opens', async () => {
    const trackedMessage = {
      action: 'collectAdvertisingTrackedWingProducts',
      idempotencyKey: 'tracked-key',
      keywords: ['A Pencil'],
    };
    sessionReply = async () => session;
    vi.mocked(sendToExtension).mockImplementation(async (_extensionId, sent) => {
      const { action } = sent as { action: string };
      if (action === trackedMessage.action) return new Promise(() => undefined);
      if (action === 'getCollectionSession') return sessionReply();
      throw new Error(`unexpected extension action ${action}`);
    });

    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, trackedMessage)).resolves.toBeUndefined();

    expect(sendToExtension).toHaveBeenCalledWith(EXTENSION_ID, trackedMessage, 190_000);
    expect(sendToExtension).toHaveBeenCalledWith(
      EXTENSION_ID,
      { action: 'getCollectionSession', attemptId: ATTEMPT_ID },
      2_000,
    );
  });

  it('counts an answer that did not take the attempt as taken while the extension holds its session', async () => {
    // A run that needs the operator's login answers at once, after it started the attempt's session.
    runReply = async () => ({
      success: false,
      attemptId: ATTEMPT_ID,
      terminalState: 'RUNNING',
      attentionRequired: true,
      error: 'Coupang Wing login is required.',
    });
    sessionReply = async () => session;

    await expect(handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message)).resolves.toBeUndefined();
  });

  it('rejects when the extension neither answers nor shows the session within 20 seconds', async () => {
    vi.useFakeTimers();
    const handoff = handOffToExtensionRun(EXTENSION_ID, ATTEMPT_ID, message);
    const outcome = handoff.then(() => 'resolved', (error: Error) => error.message);

    await vi.advanceTimersByTimeAsync(19_000);
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(outcome).resolves.toBe(HANDOFF_UNANSWERED);
  });
});
