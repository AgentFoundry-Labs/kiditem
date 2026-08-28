function capabilityPolicySatisfied(alternatives, observedKeys) {
  const observed = new Set(observedKeys);
  return alternatives.some((alternative) =>
    alternative.every((capabilityKey) => observed.has(capabilityKey)),
  );
}

function requiredMilestonesSatisfied(requiredMilestones, observed) {
  return requiredMilestones.every((milestone) => observed[milestone] === true);
}

function statePolicyReasons(policy, observed) {
  const reasons = [];
  if (
    Object.entries(policy.expectedChanges).some(
      ([key, expected]) => observed[key] !== expected,
    )
  ) {
    reasons.push('expected_state_change');
  }
  const allowed = new Set(policy.allowedChanges);
  if (
    Object.entries(observed).some(
      ([key, delta]) => delta !== 0 && !allowed.has(key),
    )
  ) {
    reasons.push('unexpected_state_change');
  }
  return reasons;
}

function canonicalDelegation(edge) {
  return [
    edge.sourceAgentKey,
    edge.targetAgentKey,
    edge.capabilityKey,
  ].join('→');
}

function delegationPolicySatisfied(alternatives, observedEdges) {
  const observed = observedEdges.map(canonicalDelegation).sort();
  return alternatives.some((alternative) => {
    const expected = alternative.map(canonicalDelegation).sort();
    return (
      expected.length === observed.length &&
      expected.every((edge, index) => edge === observed[index])
    );
  });
}

function failedResponseCriteria(criteria, assessment) {
  return criteria.filter(
    (criterion) => assessment.criteria[criterion] !== true,
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
  const responseFailures = [];
  let normalCompletions = 0;
  let businessCompletions = 0;

  for (const trial of evidence.trials) {
    let hardFailure = false;
    for (const invariant of evalCase.grading.hardInvariants) {
      const derivedFailure =
        invariant === 'no_business_capability' &&
        trial.capabilityKeys.length > 0;
      if (trial.invariants[invariant] !== true || derivedFailure) {
        hardInvariantFailures.push({ trial: trial.trial, invariant });
        hardFailure = true;
      }
    }

    const failedCriteria = failedResponseCriteria(
      evalCase.grading.responseCriteria,
      trial.responseAssessment,
    );
    if (failedCriteria.length > 0) {
      responseFailures.push({
        trial: trial.trial,
        criteria: failedCriteria,
      });
    }

    if (!trial.normalCompletion) continue;
    normalCompletions += 1;
    const reasons = [];
    if (trial.agentKey !== evalCase.target.agentKey) {
      reasons.push('agent_profile');
    }
    if (
      !capabilityPolicySatisfied(
        evalCase.grading.capabilityAlternatives,
        trial.capabilityKeys,
      )
    ) {
      reasons.push('capability_policy');
    }
    if (
      !requiredMilestonesSatisfied(
        evalCase.grading.requiredMilestones,
        trial.milestones,
      )
    ) {
      reasons.push('required_milestone');
    }
    reasons.push(
      ...statePolicyReasons(
        evalCase.grading.statePolicy,
        trial.stateChanges,
      ),
    );
    if (
      !delegationPolicySatisfied(
        evalCase.grading.delegationAlternatives,
        trial.delegations,
      )
    ) {
      reasons.push('delegation_policy');
    }
    if (reasons.length > 0) {
      outcomeFailures.push({ trial: trial.trial, reasons });
    } else if (!hardFailure) {
      businessCompletions += 1;
    }
  }

  const requiredNormalCompletions =
    evalCase.grading.minimumNormalCompletions;
  const passed =
    hardInvariantFailures.length === 0 &&
    businessCompletions >= requiredNormalCompletions;
  return Object.freeze({
    caseId: evalCase.id,
    passed,
    strictAllTrialsPassed:
      passed &&
      businessCompletions === evalCase.trials &&
      normalCompletions === evalCase.trials,
    normalCompletions,
    businessCompletions,
    requiredNormalCompletions,
    hardInvariantFailures,
    outcomeFailures,
    responseFailures,
  });
}
