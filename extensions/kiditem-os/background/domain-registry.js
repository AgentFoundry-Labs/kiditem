(function initializeDomainRegistry(root) {
  "use strict";

  // 주문수집 / 쿠팡 / 소싱 도메인 워커가 로드 시점에 자신을 등록한다.
  // 세 도메인이 같은 `kiditem_collection_sessions` 저장소를 공유하므로, 세션의
  // `producer` 접두사가 그 세션을 만든 도메인을 가리키는 유일한 식별자다.
  const byProducerPrefix = new Map();
  const capabilityMaps = [];

  function register(domain) {
    if (domain.capabilities) capabilityMaps.push(domain.capabilities);
    for (const prefix of domain.producerPrefixes || []) {
      if (byProducerPrefix.has(prefix)) {
        throw new Error(`Duplicate collection producer prefix: ${prefix}`);
      }
      byProducerPrefix.set(prefix, domain);
    }
  }

  // ping 응답은 세 도메인의 capabilities 를 합친 것이다. 도메인마다 따로
  // 응답하면 먼저 답한 쪽만 웹앱에 전달돼 나머지가 "확장 미설치"로 보인다.
  function capabilities() {
    return Object.assign({}, ...capabilityMaps);
  }

  function forProducer(producer) {
    if (typeof producer !== "string") return null;
    return byProducerPrefix.get(producer.split(".")[0]) || null;
  }

  function reset() {
    byProducerPrefix.clear();
    capabilityMaps.length = 0;
  }

  root.KidItemDomains = Object.freeze({
    register,
    capabilities,
    forProducer,
    reset,
  });
})(globalThis);
