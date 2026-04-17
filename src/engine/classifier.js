/**
 * AuditSkills — Finding Classifier
 * Takes test results and applies Step 4 classification rules to produce
 * formal audit findings with risk ratings, categories, and recommendations.
 */
const { v4: uuidv4 } = require('uuid');

function classify(testResults, skill, runId) {
  const rules           = (skill.step4 && skill.step4.classificationRules) || [];
  const recommendations = (skill.step4 && skill.step4.recommendedActions)  || {};
  const findings = [];
  let findingSeq = 1;

  for (const result of testResults) {
    if (!result || !result.exceptions || result.exceptions.length === 0) continue;
    if (result.error) continue; // skip tests that errored

    const rule = rules.find(r => r.testId === result.testId);
    if (!rule) continue;

    // Monetary exposure
    const totalExposure = result.exceptions.reduce((s, e) => s + Math.abs(e._amount || 0), 0);

    // Determine risk (apply escalation from default)
    let risk = rule.defaultRisk || rule.riskLevel || 'Medium';
    if (Array.isArray(rule.escalation)) {
      for (const esc of rule.escalation) {
        if (esc.ifAmountGt && totalExposure > esc.ifAmountGt)       { risk = esc.thenRisk || 'High'; break; }
        if (esc.ifCountGte && (result.excCount || 0) >= esc.ifCountGte) { risk = esc.thenRisk || 'High'; break; }
        if (esc.ifRatePctGt && (result.excRate || 0) > esc.ifRatePctGt) { risk = esc.thenRisk || 'High'; break; }
      }
    }

    const finding = {
      id: `F-${String(findingSeq++).padStart(2, '0')}`,
      runId,
      skillId: skill.id,
      testId:   result.testId,
      testName: result.testName || rule.findingTitle || result.testId,
      title:    rule.findingTitle || result.testName || result.testId,
      risk,
      category: rule.category || 'Control Deficiency',
      status: 'open',
      followUpRequired: rule.followUp !== false,
      exceptionCount:   result.excCount || result.exceptions.length,
      monetaryExposure: Math.round(totalExposure),
      recommendation:   recommendations[result.testId] || recommendations[risk] || '',
      managementResponse: '',
      condition: buildConditionSummary(result),
      exceptions: result.exceptions.slice(0, 100),
      createdAt: new Date().toISOString(),
    };

    findings.push(finding);
  }

  return findings;
}

function buildConditionSummary(result) {
  const excCount  = result.excCount || result.exceptions?.length || 0;
  const excRate   = result.excRate || 0;
  const testName  = result.testName || result.testId || 'Unnamed Test';
  const type      = result.type || '';

  if (type === 'sampling') {
    const sampleSize = result.sampleSize || 'N/A';
    return `${excCount} of ${sampleSize} sampled items (${Number(excRate).toFixed(1)}%) failed documentation review for "${testName}".`;
  }
  const total = result.total || 0;
  return `${excCount} exceptions (${Number(excRate).toFixed(2)}% of ${total} in-scope records) identified for "${testName}".`;
}

module.exports = { classify };
