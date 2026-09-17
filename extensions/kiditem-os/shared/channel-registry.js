// 생성 파일입니다. 고치지 마세요.
// 원본: packages/shared/src/channel-registry.ts
// 생성: node scripts/generate-channel-registry.mjs
//
// 확장은 빌드가 없어 공유 패키지를 그대로 쓸 수 없다. 서비스워커가 이 파일을 먼저 싣고,
// 도메인 워커는 `self.KidItemChannelRegistry` 로 읽는다. 이 파일이 원본과 다르면
// `npm run check:channel-registry-sync` 가 막는다.
(function initializeChannelRegistry(root) {
  "use strict";

  var CHANNEL_REGISTRY = Object.freeze([
    Object.freeze({ "key": "one-polaris", "name": "원폴라리스", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "none", "verified": false, "logo": null }),
    Object.freeze({ "key": "icecream-mall", "name": "아이스크림몰", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "none", "verified": false, "logo": "/mall-logos/icecream-mall.png" }),
    Object.freeze({ "key": "kidkids", "name": "키드키즈", "kind": "mall", "collector": "extension", "uploadTracking": true, "register": "form", "verified": false, "logo": "/mall-logos/kidkids.ico" }),
    Object.freeze({ "key": "kidsnote", "name": "키즈노트", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "excel", "verified": true, "logo": "/mall-logos/kidsnote.png" }),
    Object.freeze({ "key": "haebub-mall", "name": "해법몰", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "excel", "verified": true, "logo": "/mall-logos/haebub-mall.ico" }),
    Object.freeze({ "key": "onch", "name": "온채널", "kind": "mall", "collector": "extension", "uploadTracking": true, "register": "excel", "verified": true, "logo": "/mall-logos/onch.ico" }),
    Object.freeze({ "key": "kkomangse", "name": "꼬망세", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "form", "verified": false, "logo": "/mall-logos/kkomangse.ico" }),
    Object.freeze({ "key": "art09", "name": "아트공구", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "excel", "verified": false, "logo": "/mall-logos/art09.ico" }),
    Object.freeze({ "key": "tekville-edu", "name": "테크빌교육", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "none", "verified": false, "logo": "/mall-logos/tekville-edu.ico" }),
    Object.freeze({ "key": "benepia-mul", "name": "베네피아물", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "none", "verified": false, "logo": "/mall-logos/benepia-mul.png" }),
    Object.freeze({ "key": "domeggook", "name": "도매꾹", "kind": "mall", "collector": "extension", "uploadTracking": true, "register": "none", "verified": false, "logo": "/mall-logos/domeggook.ico" }),
    Object.freeze({ "key": "lotte-on", "name": "롯데ON", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "api", "verified": true, "logo": "/mall-logos/lotte-on.png" }),
    Object.freeze({ "key": "boribori", "name": "보리보리", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/boribori.ico" }),
    Object.freeze({ "key": "always", "name": "올웨이즈", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "none", "verified": false, "logo": "/mall-logos/always.png" }),
    Object.freeze({ "key": "woongjin-class", "name": "웅진클래스몰", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "none", "verified": false, "logo": "/mall-logos/woongjin-class.ico" }),
    Object.freeze({ "key": "kakao", "name": "카카오 톡스토어", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "api", "verified": true, "logo": "/mall-logos/kakao.ico" }),
    Object.freeze({ "key": "toss", "name": "토스쇼핑", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "api", "verified": true, "logo": "/mall-logos/toss.ico" }),
    Object.freeze({ "key": "teacher-mall", "name": "티쳐몰", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "form", "verified": true, "logo": "/mall-logos/teacher-mall.ico" }),
    Object.freeze({ "key": "gs-shop", "name": "GS샵", "kind": "mall", "collector": "extension", "uploadTracking": false, "register": "form", "verified": false, "logo": "/mall-logos/gs-shop.ico" }),
    Object.freeze({ "key": "coupang-direct", "name": "쿠팡직배송", "kind": "mall", "sharedAccountChannel": "rocket", "collector": "extension", "uploadTracking": false, "register": "none", "verified": true, "logo": "/mall-logos/coupang-direct.ico" }),
    Object.freeze({ "key": "gmarket", "name": "지마켓", "kind": "mall", "collector": "sellpia", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/gmarket.ico" }),
    Object.freeze({ "key": "auction", "name": "옥션", "kind": "mall", "formSpec": "gmarket", "collector": "sellpia", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/auction.png" }),
    Object.freeze({ "key": "11st", "name": "11번가", "kind": "mall", "collector": "sellpia", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/11st.ico" }),
    Object.freeze({ "key": "smartstore", "name": "스마트스토어", "kind": "mall", "collector": "sellpia", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/smartstore.ico" }),
    Object.freeze({ "key": "ssg", "name": "신세계(SSG)", "kind": "mall", "collector": "sellpia", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/ssg.ico" }),
    Object.freeze({ "key": "thirtymall", "name": "떠리몰", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "api", "verified": false, "logo": "/mall-logos/thirtymall.ico" }),
    Object.freeze({ "key": "yoons", "name": "윤선생", "kind": "mall", "collector": "none", "uploadTracking": false, "register": "none", "verified": false, "logo": "/mall-logos/yoons.ico" }),
    Object.freeze({ "key": "coupang", "name": "쿠팡(마켓플레이스)", "kind": "marketplace", "collector": "sellpia", "uploadTracking": false, "register": "api", "verified": true, "logo": "/mall-logos/coupang.ico" }),
    Object.freeze({ "key": "rocket", "name": "쿠팡 로켓", "kind": "marketplace", "collector": "extension", "uploadTracking": false, "register": "none", "verified": true, "logo": "/mall-logos/rocket.ico" }),
  ]);

  var BY_KEY = new Map(CHANNEL_REGISTRY.map(function (entry) { return [entry.key, entry]; }));

  function findChannel(key) {
    return BY_KEY.get(key) || null;
  }

  /** 확장이 이 채널의 폼을 채울 때 여는 스펙 키. 대개 제 키와 같다. */
  function channelFormSpec(key) {
    var entry = findChannel(key);
    return (entry && entry.formSpec) || key;
  }

  /** 관찰 기록 · 알림이 쓰는 키 — 계정 행을 함께 쓰는 채널은 그 행의 채널로 모은다. */
  function channelOutcomeKey(key) {
    var entry = findChannel(key);
    return (entry && entry.sharedAccountChannel) || key;
  }

  /** 우리 확장 수집기가 주문을 가져오는 채널. */
  function channelCollectsViaExtension(key) {
    var entry = findChannel(key);
    return Boolean(entry) && entry.collector === "extension";
  }

  /** 확장에 발송처리(송장 등록) 경로가 있는 채널. */
  function channelUploadsTracking(key) {
    var entry = findChannel(key);
    return Boolean(entry) && entry.uploadTracking === true;
  }

  root.KidItemChannelRegistry = Object.freeze({
    CHANNEL_REGISTRY: CHANNEL_REGISTRY,
    findChannel: findChannel,
    channelFormSpec: channelFormSpec,
    channelOutcomeKey: channelOutcomeKey,
    channelCollectsViaExtension: channelCollectsViaExtension,
    channelUploadsTracking: channelUploadsTracking,
  });
})(typeof self !== "undefined" ? self : globalThis);
