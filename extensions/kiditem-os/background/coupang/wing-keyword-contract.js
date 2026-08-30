(function installWingKeywordContract(root) {
  "use strict";

  const CONTRACT_VERSION = "nfkc-collapse-casefold-v1";

  function canonicalize(value) {
    if (typeof value !== "string") {
      throw new Error("wing_catalog_operation_input_invalid");
    }
    return value.normalize("NFKC").trim().replace(/\s+/g, " ");
  }

  function identity(value) {
    return canonicalize(value).toLocaleLowerCase("en-US");
  }

  function parseBatchKeywords(value, maximumKeywords = 12, maximumLength = 100) {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > maximumKeywords
    ) {
      throw new Error("wing_catalog_operation_input_invalid");
    }
    const keywords = value.map(canonicalize);
    const identities = keywords.map(identity);
    if (
      keywords.some(
        (keyword) => keyword.length < 1 || keyword.length > maximumLength,
      ) ||
      new Set(identities).size !== identities.length
    ) {
      throw new Error("wing_catalog_operation_input_invalid");
    }
    return keywords;
  }

  root.KidItemWingKeywordContract = Object.freeze({
    contractVersion: CONTRACT_VERSION,
    canonicalize,
    identity,
    parseBatchKeywords,
  });
})(globalThis);
