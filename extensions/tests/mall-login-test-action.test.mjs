import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * 쇼핑몰 계정 화면의 로그인 테스트(`testMallLogin`).
 *
 * `ensureMallLoggedIn` 액션은 주문 수집 시도 안에서만 돈다(수집 시도 ID 필수). 로그인 테스트는
 * 수집이 아니어서 그 액션으로 보내면 늘 `OWNER_ATTEMPT_REQUIRED` 로 끝났다 — 테스트가 실패하고
 * 그 몰의 자동 로그인까지 막혔다. 그래서 수집 시도 없이 도는 액션을 따로 둔다.
 *
 * 로그인 자체는 몰 세션 모듈이 한다(KID-254). 이 액션이 수집 시도 없이 그 모듈을 바로 부르는지만
 * 본다 — 수집 lifecycle 을 거치면 다시 `OWNER_ATTEMPT_REQUIRED` 로 돌아간다.
 */
const workerSource = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

function handlerBlock(action) {
  const start = workerSource.indexOf(`if (msg?.action === "${action}")`);
  assert.notEqual(start, -1, `${action} handler missing`);
  const end = workerSource.indexOf("\n  if (msg?.action ===", start + 1);
  return workerSource.slice(start, end === -1 ? undefined : end);
}

test("⭐ the login test logs in without an order collection attempt", () => {
  const block = handlerBlock("testMallLogin");
  assert.match(block, /mallSession\(\)\.ensureLoggedIn\(/);
  assert.doesNotMatch(block, /collection|runOwnedOrderCollection/, "수집 시도 없이 부른다");
  assert.doesNotMatch(block, /ensureMallLoginWithLifecycle/);
});

test("the login test validates the external payload before opening a tab", () => {
  const block = handlerBlock("testMallLogin");
  assert.match(block, /typeof msg\.mallKey === "string"/);
  assert.match(block, /typeof credentials\?\.password === "string"/);
  assert.match(block, /errorCode: "invalid_request"/);
});

test("the worker advertises the login test capability", () => {
  assert.match(workerSource, /mallLoginTestV1: true/);
});
