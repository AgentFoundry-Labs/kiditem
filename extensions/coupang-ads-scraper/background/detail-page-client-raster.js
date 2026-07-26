(function installKidItemDetailPageClientRaster(root) {
  'use strict';

  const PORT_NAME = 'kiditem-detail-page-raster-v1';
  const VARIANT = 'wing-client-jpeg-v1';
  const LAYOUT_WIDTH = 720;
  const OUTPUT_WIDTH = 780;
  const MAX_HEIGHT = 50_000;
  const MAX_LAYOUT_HEIGHT = Math.floor(MAX_HEIGHT * LAYOUT_WIDTH / OUTPUT_WIDTH);
  const MAX_BYTES = 10 * 1024 * 1024;
  const JPEG_QUALITY = 90;
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function create(options) {
    const chromeApi = options.chrome;
    const authedFetch = options.authedFetch;
    const fetchFn = options.fetchFn;
    const resolveEnvironment = options.resolveEnvironment;
    const now = options.now || Date.now;
    const cache = options.cache || createIndexedDbCache({ indexedDB: root.indexedDB, now });
    const readinessTimeoutMs = options.readinessTimeoutMs || 15_000;
    const readinessPollMs = options.readinessPollMs || 100;

    async function run(input) {
      if (!UUID_PATTERN.test(input?.intentId || '')) {
        return failed('invalid_intent_id', '유효한 상세페이지 렌더 요청 ID가 필요합니다.');
      }
      const intentId = input.intentId;
      const environmentId = input.environmentId;
      const onProgress =
        typeof input.onProgress === 'function' ? input.onProgress : () => undefined;
      let tabId = null;
      let windowId = null;
      let attached = false;
      let claimed = false;

      try {
        onProgress('loading');
        const claim = validateClaim(
          await postJson(
            environmentId,
            `/api/ai/detail-page-image/render-intents/${intentId}/claim`,
          ),
          intentId,
          environmentId,
          resolveEnvironment,
        );
        claimed = true;
        let captured = await readMatchingCache(cache, claim, now());

        if (!captured) {
          const renderWindow = await chromeApi.windows.create({
            url: 'about:blank',
            focused: false,
            type: 'normal',
          });
          if (!Number.isInteger(renderWindow?.id)) {
            throw createError('window_create_failed', '렌더 창을 열지 못했습니다.');
          }
          windowId = renderWindow.id;
          const tab = Array.isArray(renderWindow.tabs) ? renderWindow.tabs[0] : null;
          if (!Number.isInteger(tab?.id)) {
            throw createError('tab_create_failed', '렌더 창의 활성 탭을 찾지 못했습니다.');
          }
          tabId = tab.id;
          const target = { tabId };
          await chromeApi.debugger.attach(target, '1.3');
          attached = true;
          await chromeApi.debugger.sendCommand(target, 'Page.enable');
          await chromeApi.debugger.sendCommand(target, 'Runtime.enable');
          await chromeApi.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
            width: LAYOUT_WIDTH,
            height: 800,
            deviceScaleFactor: OUTPUT_WIDTH / LAYOUT_WIDTH,
            mobile: false,
          });
          await chromeApi.debugger.sendCommand(target, 'Emulation.setScrollbarsHidden', {
            hidden: true,
          });
          await chromeApi.debugger.sendCommand(target, 'Page.navigate', {
            url: claim.renderDocumentUrl,
          });
          const ready = await waitForReady({
            chromeApi,
            target,
            intentId,
            revisionId: claim.revisionId,
            timeoutMs: readinessTimeoutMs,
            pollMs: readinessPollMs,
            now,
          });
          const finalTab = await chromeApi.tabs.get(tabId);
          if (!isRenderDocumentUrl(finalTab?.url, intentId, claim.webOrigin)) {
            throw createError(
              'render_tab_mismatch',
              '렌더 탭이 허용된 KidItem 문서에서 벗어났습니다.',
            );
          }
          const layoutMetrics = await chromeApi.debugger.sendCommand(
            target,
            'Page.getLayoutMetrics',
          );
          const cssContentSize = layoutMetrics?.cssContentSize;
          const layoutWidth = Math.ceil(Number(cssContentSize?.width));
          const layoutHeight = Math.ceil(Number(cssContentSize?.height));
          if (
            !Number.isFinite(layoutWidth) ||
            !Number.isFinite(layoutHeight) ||
            layoutWidth !== LAYOUT_WIDTH ||
            layoutHeight < ready.height ||
            layoutHeight > MAX_LAYOUT_HEIGHT
          ) {
            throw createError(
              'render_layout_invalid',
              `렌더 문서의 최종 레이아웃 크기가 허용 범위를 벗어났습니다 (${layoutWidth}x${layoutHeight}; expected ${LAYOUT_WIDTH}x${ready.height}).`,
            );
          }
          onProgress('capturing');
          const screenshot = await chromeApi.debugger.sendCommand(
            target,
            'Page.captureScreenshot',
            {
              format: 'jpeg',
              quality: JPEG_QUALITY,
              fromSurface: true,
              captureBeyondViewport: true,
              clip: {
                x: 0,
                y: 0,
                width: LAYOUT_WIDTH,
                height: ready.height,
                scale: 1,
              },
            },
          );
          const bytesBase64 = screenshot?.data;
          if (typeof bytesBase64 !== 'string' || !bytesBase64) {
            throw createError('capture_empty', '상세페이지 JPEG 캡처 결과가 비어 있습니다.');
          }
          const bytes = decodeBase64(bytesBase64);
          const dimensions = readJpegDimensions(bytes);
          if (
            dimensions.width !== OUTPUT_WIDTH ||
            dimensions.height <= 0 ||
            dimensions.height > MAX_HEIGHT ||
            bytes.byteLength <= 0 ||
            bytes.byteLength > MAX_BYTES
          ) {
            throw createError(
              'capture_invalid',
              `상세페이지 JPEG 규격이 올바르지 않습니다 (${dimensions.width}x${dimensions.height}, ${bytes.byteLength} bytes).`,
            );
          }
          captured = {
            intentId,
            revisionId: claim.revisionId,
            variant: claim.variant,
            outputWidth: claim.outputWidth,
            pixelWidth: dimensions.width,
            pixelHeight: dimensions.height,
            byteLength: bytes.byteLength,
            sha256: await sha256(bytes),
            bytesBase64,
            expiresAt: Date.parse(claim.upload.expiresAt),
            createdAt: now(),
          };
          await cache.put(captured);
        }

        onProgress('uploading');
        const uploadResponse = await fetchFn(claim.upload.url, {
          method: 'PUT',
          headers: claim.upload.headers,
          body: decodeBase64(captured.bytesBase64),
        });
        if (!uploadResponse?.ok) {
          throw createError(
            'upload_failed',
            `상세페이지 JPEG 업로드에 실패했습니다 (${uploadResponse?.status || 0}).`,
            true,
          );
        }

        onProgress('finalizing');
        const finalized = await postJson(
          environmentId,
          `/api/ai/detail-page-image/render-intents/${intentId}/finalize`,
          {
            byteLength: captured.byteLength,
            sha256: captured.sha256,
            pixelWidth: captured.pixelWidth,
            pixelHeight: captured.pixelHeight,
          },
          true,
        );
        if (finalized?.state !== 'completed' || !finalized.artifact?.imageUrl) {
          throw createError(
            'finalize_failed',
            '상세페이지 JPEG 확정 응답이 올바르지 않습니다.',
            true,
          );
        }
        await cache.delete(intentId);
        return { status: 'rendered', artifact: finalized.artifact };
      } catch (error) {
        const normalized = normalizeError(error);
        if (claimed && !normalized.retryable) {
          await postJson(
            environmentId,
            `/api/ai/detail-page-image/render-intents/${intentId}/fail`,
            { code: normalized.code, message: normalized.message },
          ).catch(() => undefined);
          await cache.delete(intentId).catch(() => undefined);
        }
        return { status: 'failed', error: normalized };
      } finally {
        if (attached && Number.isInteger(tabId)) {
          await chromeApi.debugger.detach({ tabId }).catch(() => undefined);
        }
        if (Number.isInteger(windowId)) {
          await chromeApi.windows.remove(windowId).catch(() => undefined);
        } else if (Number.isInteger(tabId)) {
          await chromeApi.tabs.remove(tabId).catch(() => undefined);
        }
      }
    }

    function handlePort(port, environmentId) {
      if (port?.name !== PORT_NAME) {
        port?.disconnect?.();
        return false;
      }
      let started = false;
      port.onMessage.addListener((message) => {
        if (started) return;
        started = true;
        if (message?.action !== 'renderDetailPageImage') {
          safePost(port, failed('invalid_action', '지원하지 않는 렌더 요청입니다.'));
          port.disconnect();
          return;
        }
        void run({
          environmentId,
          intentId: message.intentId,
          onProgress: (phase) => safePost(port, { status: 'progress', phase }),
        }).then((result) => {
          safePost(port, result);
          port.disconnect();
        });
      });
      return true;
    }

    async function postJson(environmentId, path, body, retryable = false) {
      let response;
      try {
        response = await authedFetch(environmentId, path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        throw createError(
          retryable ? 'finalize_network_failed' : 'kiditem_api_failed',
          error?.message || 'KidItem API 요청에 실패했습니다.',
          retryable,
        );
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw createError(
          retryable ? 'finalize_failed' : 'kiditem_api_failed',
          typeof payload?.message === 'string'
            ? payload.message
            : `KidItem API 요청에 실패했습니다 (${response.status}).`,
          retryable,
        );
      }
      return payload;
    }

    return Object.freeze({ handlePort, run });
  }

  async function waitForReady(input) {
    const deadline = input.now() + input.timeoutMs;
    while (input.now() <= deadline) {
      try {
        const evaluation = await input.chromeApi.debugger.sendCommand(
          input.target,
          'Runtime.evaluate',
          {
            expression: `(() => {
              const data = document.documentElement.dataset;
              return {
                status: data.kiditemRenderStatus || 'loading',
                intentId: data.kiditemIntentId || '',
                revisionId: data.kiditemRevisionId || '',
                width: Number(data.kiditemContentWidth || 0),
                height: Number(data.kiditemContentHeight || 0)
              };
            })()`,
            returnByValue: true,
          },
        );
        const value = evaluation?.result?.value;
        if (value?.status === 'error') {
          throw createError('render_document_failed', '렌더 문서의 이미지 또는 폰트 준비에 실패했습니다.');
        }
        if (value?.status === 'ready') {
          if (
            value.intentId !== input.intentId ||
            value.revisionId !== input.revisionId ||
            value.width !== LAYOUT_WIDTH ||
            !Number.isInteger(value.height) ||
            value.height <= 0 ||
            value.height > MAX_LAYOUT_HEIGHT
          ) {
            throw createError('render_document_mismatch', '렌더 문서 식별자 또는 크기가 일치하지 않습니다.');
          }
          return value;
        }
      } catch (error) {
        if (error?.code) throw error;
      }
      await delay(input.pollMs);
    }
    throw createError('render_document_timeout', '상세페이지 렌더 문서 준비 시간이 초과되었습니다.');
  }

  function validateClaim(value, intentId, environmentId, resolveEnvironment) {
    let webOrigin = '';
    try {
      webOrigin = resolveEnvironment(environmentId)?.webOrigin || '';
    } catch {
      // The common validation below reports a bounded claim error.
    }
    if (
      value?.intentId !== intentId ||
      !UUID_PATTERN.test(value?.revisionId || '') ||
      value?.variant !== VARIANT ||
      value?.outputWidth !== OUTPUT_WIDTH ||
      typeof value?.renderDocumentUrl !== 'string' ||
      typeof value?.upload?.url !== 'string' ||
      !value?.upload?.headers ||
      !Number.isFinite(Date.parse(value?.upload?.expiresAt || '')) ||
      !isRenderDocumentUrl(value?.renderDocumentUrl, intentId, webOrigin)
    ) {
      throw createError('claim_invalid', '상세페이지 렌더 claim 응답이 올바르지 않습니다.');
    }
    return { ...value, webOrigin };
  }

  function isRenderDocumentUrl(value, intentId, webOrigin) {
    try {
      const url = new URL(value);
      return (
        url.origin === webOrigin &&
        url.pathname === '/detail-page-client-render' &&
        url.hash === '' &&
        url.searchParams.get('intentId') === intentId &&
        [...url.searchParams.keys()].every((key) => key === 'intentId')
      );
    } catch {
      return false;
    }
  }

  async function readMatchingCache(cache, claim, currentTime) {
    const cached = await cache.get(claim.intentId);
    if (!cached) return null;
    let bytes = null;
    let dimensions = null;
    let digest = null;
    try {
      bytes = decodeBase64(cached.bytesBase64);
      dimensions = readJpegDimensions(bytes);
      digest = await sha256(bytes);
    } catch {
      // Invalid local data is discarded below and never uploaded.
    }
    const matches =
      cached.intentId === claim.intentId &&
      cached.revisionId === claim.revisionId &&
      cached.variant === claim.variant &&
      cached.outputWidth === OUTPUT_WIDTH &&
      cached.pixelWidth === OUTPUT_WIDTH &&
      cached.pixelHeight > 0 &&
      cached.pixelHeight <= MAX_HEIGHT &&
      cached.byteLength > 0 &&
      cached.byteLength <= MAX_BYTES &&
      /^[a-f0-9]{64}$/.test(cached.sha256 || '') &&
      typeof cached.bytesBase64 === 'string' &&
      cached.expiresAt > currentTime &&
      bytes?.byteLength === cached.byteLength &&
      dimensions?.width === cached.pixelWidth &&
      dimensions?.height === cached.pixelHeight &&
      digest === cached.sha256;
    if (matches) return cached;
    await cache.delete(claim.intentId);
    return null;
  }

  function readJpegDimensions(bytes) {
    if (
      bytes.byteLength < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[bytes.byteLength - 2] !== 0xff ||
      bytes[bytes.byteLength - 1] !== 0xd9
    ) {
      throw createError('capture_invalid', '캡처 결과가 JPEG가 아닙니다.');
    }
    let offset = 2;
    while (offset + 8 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + 2 + length > bytes.byteLength) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
    throw createError('capture_invalid', 'JPEG 크기 정보를 확인할 수 없습니다.');
  }

  async function sha256(bytes) {
    const digest = await root.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  function decodeBase64(value) {
    const binary = root.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function createIndexedDbCache(options) {
    const databaseName = 'kiditem-detail-page-raster-v1';
    const storeName = 'captures';
    const open = () =>
      new Promise((resolve, reject) => {
        if (!options.indexedDB) return reject(new Error('IndexedDB를 사용할 수 없습니다.'));
        const request = options.indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) {
            request.result.createObjectStore(storeName, { keyPath: 'intentId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      });
    const requestResult = (request) =>
      new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
      });
    return {
      async get(intentId) {
        const db = await open();
        try {
          return await requestResult(
            db.transaction(storeName, 'readonly').objectStore(storeName).get(intentId),
          );
        } finally {
          db.close();
        }
      },
      async put(entry) {
        const db = await open();
        try {
          await requestResult(
            db.transaction(storeName, 'readwrite').objectStore(storeName).put(entry),
          );
          const store = db.transaction(storeName, 'readonly').objectStore(storeName);
          const entries = await requestResult(store.getAll());
          entries.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
          let totalBytes = entries.reduce((sum, item) => sum + (item.byteLength || 0), 0);
          while (entries.length > 3 || totalBytes > 20 * 1024 * 1024) {
            const oldest = entries.shift();
            if (!oldest) break;
            totalBytes -= oldest.byteLength || 0;
            await requestResult(
              db
                .transaction(storeName, 'readwrite')
                .objectStore(storeName)
                .delete(oldest.intentId),
            );
          }
        } finally {
          db.close();
        }
      },
      async delete(intentId) {
        const db = await open();
        try {
          await requestResult(
            db.transaction(storeName, 'readwrite').objectStore(storeName).delete(intentId),
          );
        } finally {
          db.close();
        }
      },
    };
  }

  function createError(code, message, retryable = false) {
    const error = new Error(message);
    error.code = code;
    error.retryable = retryable;
    return error;
  }

  function normalizeError(error) {
    const message = String(error?.message || error || '상세페이지 이미지 생성에 실패했습니다.')
      .slice(0, 300);
    return {
      code: /^[a-z0-9_]{1,64}$/.test(error?.code || '')
        ? error.code
        : 'client_render_failed',
      message,
      retryable: error?.retryable === true,
    };
  }

  function failed(code, message) {
    return { status: 'failed', error: { code, message, retryable: false } };
  }

  function safePost(port, message) {
    try {
      port.postMessage(message);
    } catch {
      // The web tab may close; the server status remains recoverable.
    }
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  root.KidItemDetailPageClientRaster = Object.freeze({
    PORT_NAME,
    create,
    readJpegDimensions,
  });
})(globalThis);
