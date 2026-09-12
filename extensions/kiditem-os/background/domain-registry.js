(function initializeDomainRegistry(root) {
  "use strict";

  // 주문수집 / 쿠팡 / 소싱 도메인 워커가 로드 시점에 자신을 등록한다.
  // 세 도메인이 같은 `kiditem_collection_sessions` 저장소를 공유하므로, 세션의
  // `producer` 접두사가 그 세션을 만든 도메인을 가리키는 유일한 식별자다.
  const byProducerPrefix = new Map();
  const byExternalPortName = new Map();
  const byExternalAction = new Map();
  const capabilityMaps = [];
  const registeredDomains = [];

  function register(domain) {
    if (!domain || typeof domain !== "object") {
      throw new Error("Invalid domain registration");
    }
    for (const hookName of [
      "cancelAdditionalCollections",
      "retryAdditionalCollections",
      "recoverCollections",
    ]) {
      if (domain[hookName] !== undefined && typeof domain[hookName] !== "function") {
        throw new Error(`Invalid domain lifecycle hook: ${hookName}`);
      }
    }
    registeredDomains.push(domain);
    if (domain.capabilities) capabilityMaps.push(domain.capabilities);
    for (const prefix of domain.producerPrefixes || []) {
      if (byProducerPrefix.has(prefix)) {
        throw new Error(`Duplicate collection producer prefix: ${prefix}`);
      }
      byProducerPrefix.set(prefix, domain);
    }
    for (const [portName, handler] of Object.entries(domain.externalPorts || {})) {
      if (byExternalPortName.has(portName)) {
        throw new Error(`Duplicate external port name: ${portName}`);
      }
      if (typeof handler !== "function") {
        throw new Error(`Invalid external port handler: ${portName}`);
      }
      byExternalPortName.set(portName, handler);
    }
    for (const [action, contract] of Object.entries(domain.externalActions || {})) {
      if (byExternalAction.has(action)) {
        throw new Error(`Duplicate external action: ${action}`);
      }
      if (
        !contract ||
        typeof contract.validate !== "function" ||
        typeof contract.handle !== "function"
      ) {
        throw new Error(`Invalid external action handler: ${action}`);
      }
      byExternalAction.set(action, contract);
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

  function forExternalPort(portName) {
    if (typeof portName !== "string") return null;
    return byExternalPortName.get(portName) || null;
  }

  function forExternalAction(action) {
    if (typeof action !== "string") return null;
    return byExternalAction.get(action) || null;
  }

  function list() {
    return [...new Set(registeredDomains)];
  }

  function reset() {
    byProducerPrefix.clear();
    byExternalPortName.clear();
    byExternalAction.clear();
    capabilityMaps.length = 0;
    registeredDomains.length = 0;
  }

  root.KidItemDomains = Object.freeze({
    register,
    capabilities,
    forProducer,
    forExternalAction,
    forExternalPort,
    list,
    reset,
  });
})(globalThis);
