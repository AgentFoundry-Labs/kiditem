"use strict";
var KidItemSourceReadiness = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/shared/src/source-readiness-runtime.ts
  var source_readiness_runtime_exports = {};
  __export(source_readiness_runtime_exports, {
    SOURCE_READINESS_LABELS: () => SOURCE_READINESS_LABELS,
    deriveSourceReadiness: () => deriveSourceReadiness,
    sourceReadinessStatus: () => sourceReadinessStatus
  });
  var SOURCE_READINESS_LABELS = {
    ready: "\uCD5C\uC2E0",
    stale: "\uAC31\uC2E0 \uD544\uC694",
    missing: "\uBBF8\uC218\uC9D1"
  };
  function deriveSourceReadiness(input) {
    const actualCutoff = validCalendarDate(input.latestComplete?.actualCutoff) ? input.latestComplete.actualCutoff : null;
    return {
      ready: actualCutoff !== null && validCalendarDate(input.requiredCutoff) && actualCutoff >= input.requiredCutoff,
      requiredCutoff: input.requiredCutoff,
      actualCutoff,
      latestAttempt: input.latestAttempt,
      latestComplete: input.latestComplete
    };
  }
  function sourceReadinessStatus(source) {
    if (source.ready) return "ready";
    return validCalendarDate(source.latestComplete?.actualCutoff) ? "stale" : "missing";
  }
  function validCalendarDate(value) {
    if (value === null || value === void 0 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  return __toCommonJS(source_readiness_runtime_exports);
})();
