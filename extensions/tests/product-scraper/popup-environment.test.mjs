import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// 소싱 수동 수집 UI는 product-scraper 확장의 독립 팝업이었다. 세 확장을
// kiditem-os 하나로 합치면서 MV3 가 툴바에 팝업과 사이드패널을 동시에 걸지
// 못하므로, 사이드패널의 한 섹션(sourcing-panel.js)으로 옮겼다. 환경 선택은
// 패널이 이미 소유한 셀렉트를 재사용한다.
const popupHtml = fs.readFileSync(
  path.resolve('extensions/kiditem-os/popup/popup.html'),
  'utf8',
);
const panelSource = fs.readFileSync(
  path.resolve('extensions/kiditem-os/popup/sourcing-panel.js'),
  'utf8',
);
const popupSource = fs.readFileSync(
  path.resolve('extensions/kiditem-os/popup/popup.js'),
  'utf8',
);

test('소싱 섹션이 사이드패널에 있고 편집 가능한 API URL을 노출하지 않는다', () => {
  assert.match(popupHtml, /id="sourcingBtnCollect"/);
  assert.match(popupHtml, /id="environmentSelect"/);
  assert.doesNotMatch(popupHtml, /id="apiUrl"/);
  assert.doesNotMatch(popupHtml, /API 설정/);
  assert.match(popupHtml, /src="sourcing-panel\.js"/);
});

test('소싱 섹션은 패널이 소유한 환경 셀렉트를 재사용한다', () => {
  assert.match(panelSource, /environmentSelect/);
  assert.match(panelSource, /environmentId/);
  // 도메인마다 환경을 따로 조회하면 같은 액션에 두 리스너가 경쟁 응답한다.
  assert.doesNotMatch(panelSource, /getConnectedKidItemEnvironments/);
  assert.match(popupSource, /getConnectedKidItemEnvironments/);
});

test('소싱 섹션은 전역 환경 폴백을 저장하지 않는다', () => {
  assert.doesNotMatch(panelSource, /apiBase/);
  assert.doesNotMatch(panelSource, /chrome\.storage\.local\.set/);
  assert.doesNotMatch(panelSource, /lastEnvironment|storage.*environment/i);
});
