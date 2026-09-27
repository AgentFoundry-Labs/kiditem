import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

// 광고센터 계정 유형 선택(KID-371): `/user/login`에 폼이 없으면 "쿠팡 wing 로그인"을 한 번 누른다 — 옛 ads-report.js가
// 하던 이동 클릭을 새 런타임 페이지 호출 처리기(`content/ad-center/account-choice.js`)로 옮겼다.
const HANDLER = readFileSync(new URL("../kiditem-os/content/ad-center/account-choice.js", import.meta.url), "utf8");

function page(body) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: "https://advertising.coupang.com/user/login", runScripts: "outside-only" });
  const clicks = [];
  dom.window.document.addEventListener("click", (event) => clicks.push(event.target.id), true);
  dom.window.eval(HANDLER);
  return { choose: () => dom.window.__kiditemIsolatedPageCalls["adCenter.chooseWingAccount"](), clicks };
}

test("계정 유형 화면: 간편 로그인은 건너뛰고 쿠팡 wing 로그인만 한 번 누른다, 폼이 보이면 누르지 않는다, 모르면 누르지 않는다", () => {
  const selector = page(`
    <button id="kakao">카카오 간편 로그인</button>
    <div><p>로켓배송 공급사(서플라이어 허브) 계정으로 광고를 운영하는 판매자</p><a id="retail" href="#">서플라이어 허브 로그인하기</a></div>
    <div><p>마켓플레이스 &amp; 로켓그로스 판매자 계정으로 광고를 운영하는 판매자</p><button id="wing">쿠팡 wing 로그인</button></div>`);
  assert.deepEqual(JSON.parse(JSON.stringify(selector.choose())), { state: "clicked" });
  assert.deepEqual(selector.clicks, ["wing"]);

  const card = page(`<div><p>마켓플레이스 &amp; 로켓그로스 판매자 계정으로 광고를 운영하는 판매자입니다</p><a id="card" href="#">로그인하기</a></div>`);
  assert.equal(card.choose().state, "clicked");
  assert.deepEqual(card.clicks, ["card"]);

  const form = page(`<input name="username"><input type="password" name="password"><button id="submit">로그인</button>`);
  assert.equal(form.choose().state, "form");
  assert.deepEqual(form.clicks, []);

  const unknown = page(`<a id="other" href="#">로그인하기</a>`);
  assert.equal(unknown.choose().state, "not_found");
  assert.deepEqual(unknown.clicks, []);
});
