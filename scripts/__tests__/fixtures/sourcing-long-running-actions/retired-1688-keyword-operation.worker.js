async function runSourcing1688KeywordSearchOperation(operation) {
  return operation;
}

KidItemDomains.register({
  operations: {
    "sourcing.search_1688_keyword_batch": runSourcing1688KeywordSearchOperation,
  },
});
