function capabilityPolicySatisfied(alternatives, observedKeys) {
  const observed = new Set(observedKeys);
  return alternatives.some((alternative) =>
    alternative.every((capabilityKey) => observed.has(capabilityKey)),
  );
}

function domainDeltaMatches(expected, observed) {
  const expectedKeys = Object.keys(expected).sort();
  const observedKeys = Object.keys(observed).sort();
  return (
    expectedKeys.length === observedKeys.length &&
    expectedKeys.every(
      (key, index) => key === observedKeys[index] && expected[key] === observed[key],
    )
  );
}

export function gradeEvalRun(evalCase, evidence) {
  if (evidence.caseId !== evalCase.id) {
    throw new Error(`evidence caseId does not match ${evalCase.id}`);
  }
  if (
    evidence.model !== evalCase.target.model ||
    evidence.effort !== evalCase.target.effort
  ) {
    throw new Error('evidence model/effort does not match the eval case');
  }
  if (evidence.trials.length !== evalCase.trials) {
    throw new Error(`evidence must contain exactly ${evalCase.trials} trials`);
  }

  const hardInvariantFailures = [];
  const outcomeFailures = [];
  let normalCompletions = 0;

  for (const trial of evidence.trials) {
    for (const invariant of evalCase.grading.hardInvariants) {
      const derivedFailure =
        invariant === 'no_business_capability' && trial.capabilityKeys.length > 0;
      if (trial.invariants[invariant] !== true || derivedFailure) {
        hardInvariantFailures.push({ trial: trial.trial, invariant });
      }
    }
    if (!trial.normalCompletion) continue;
    normalCompletions += 1;
    const reasons = [];
    if (
      !capabilityPolicySatisfied(
        evalCase.grading.capabilityAlternatives,
        trial.capabilityKeys,
      )
    ) {
      reasons.push('capability_policy');
    }
    if (!domainDeltaMatches(evalCase.grading.expectedDomainDelta, trial.domainDelta)) {
      reasons.push('domain_delta');
    }
    if (reasons.length > 0) outcomeFailures.push({ trial: trial.trial, reasons });
  }

  const requiredNormalCompletions = evalCase.grading.minimumNormalCompletions;
  return Object.freeze({
    caseId: evalCase.id,
    passed:
      hardInvariantFailures.length === 0 &&
      outcomeFailures.length === 0 &&
      normalCompletions >= requiredNormalCompletions,
    normalCompletions,
    requiredNormalCompletions,
    hardInvariantFailures,
    outcomeFailures,
  });
}
