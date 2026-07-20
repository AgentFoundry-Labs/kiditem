import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const helperSource = await readFile(
  new URL(
    "../../coupang-ads-scraper/background/wing-image-fetch.js",
    import.meta.url,
  ),
  "utf8",
);
const workerSource = await readFile(
  new URL(
    "../../coupang-ads-scraper/background/service-worker.js",
    import.meta.url,
  ),
  "utf8",
);

class TestFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onload?.();
    }, () => this.onerror?.());
  }
}

function createHarness() {
  const fetchCalls = [];
  const context = vm.createContext({ URL });
  vm.runInContext(helperSource, context, { filename: "wing-image-fetch.js" });
  const handler = context.KidItemWingImageFetch.create({
    runtimeId: "kiditem-extension-id",
    fetchFn: async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(["image-bytes"], { type: "image/jpeg" }),
      };
    },
    FileReaderCtor: TestFileReader,
  }).handleMessage;

  async function dispatch(message, sender) {
    let response;
    const completed = new Promise((resolve) => {
      const keepChannelOpen = handler(message, sender, (value) => {
        response = value;
        resolve();
      });
      assert.equal(keepChannelOpen, true);
    });
    await completed;
    return response;
  }

  return { dispatch, fetchCalls, handler };
}

const validSender = {
  id: "kiditem-extension-id",
  url: "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2?locale=ko_KR",
};

test("routes the fallback through an internal runtime listener, not the external web listener", () => {
  assert.match(workerSource, /"wing-image-fetch\.js"/);
  assert.match(
    workerSource,
    /chrome\.runtime\.onMessage\.addListener\(wingImageFetch\.handleMessage\)/,
  );
  assert.doesNotMatch(workerSource, /fetchImageAsDataUrl/);
});

test("returns a data URL for the WING registration content script and KidItem MinIO bucket", async () => {
  const harness = createHarness();

  const response = await harness.dispatch(
    {
      action: "fetchImageAsDataUrl",
      url: "http://localhost:9000/kiditem/detail-page-images/revision/detail.jpg",
    },
    validSender,
  );

  assert.equal(response.ok, true);
  assert.match(response.dataUrl, /^data:image\/jpeg;base64,/);
  assert.deepEqual(harness.fetchCalls, [
    "http://localhost:9000/kiditem/detail-page-images/revision/detail.jpg",
  ]);
});

test("rejects external or non-registration-page senders before fetching", async () => {
  for (const sender of [
    { ...validSender, id: "external-web-app" },
    { ...validSender, url: "http://localhost:3000/product-pipeline" },
    { ...validSender, url: "https://wing.coupang.com/vendor-inventory/list" },
  ]) {
    const harness = createHarness();
    const response = await harness.dispatch(
      {
        action: "fetchImageAsDataUrl",
        url: "http://localhost:9000/kiditem/detail.jpg",
      },
      sender,
    );
    assert.equal(response.ok, false);
    assert.match(response.error, /허용되지 않은 이미지 요청 발신자/);
    assert.equal(harness.fetchCalls.length, 0);
  }
});

test("rejects URLs outside the local KidItem MinIO bucket before fetching", async () => {
  for (const url of [
    "http://localhost:9000/private/detail.jpg",
    "http://127.0.0.1:9000/kiditem/detail.jpg",
    "https://example.com/detail.jpg",
    "file:///tmp/detail.jpg",
  ]) {
    const harness = createHarness();
    const response = await harness.dispatch(
      { action: "fetchImageAsDataUrl", url },
      validSender,
    );
    assert.equal(response.ok, false);
    assert.match(response.error, /허용되지 않은 이미지 URL/);
    assert.equal(harness.fetchCalls.length, 0);
  }
});

test("ignores unrelated internal actions", () => {
  const { handler } = createHarness();
  let responded = false;
  const result = handler(
    { action: "syncToServer" },
    validSender,
    () => {
      responded = true;
    },
  );
  assert.equal(result, undefined);
  assert.equal(responded, false);
});
