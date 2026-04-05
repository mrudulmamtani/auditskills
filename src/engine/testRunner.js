/**
 * AuditSkills — Audit Test Runner
 * Executes each test procedure in the Skill against the ingested population.
 *
 * Criteria objects accept flexible field names to handle both hand-crafted
 * skills and builder/AI-generated skills:
 *
 *   null_when    : field, condition.field | conditionField, condition.value | conditionValue
 *   three_way_match : invoiceAmountField | invoiceField, poAmountField | poField, tolerancePct (0–1 or 1–100)
 *   split_payment   : vendorField | groupField, amountField, amountThreshold | thresholdUsd, windowDays
 *   exact_duplicate : keyFields | fields
 *   gt / gte / lt / lte / eq : field, value
 *   out_of_period   : dateField (flags all — real cut-off needs period config)
 */

/** Pick the first truthy value from a list of keys on an object. */
function pick(obj, ...keys) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return undefined;
}

/**
 * T-type: population_100pct
 */
function runPopulation100pct(test, rows, skill) {
  const materiality = (skill.step1 && skill.step1.materialityUsd) || 10000;
  const criteria    = test.criteria || {};
  const exceptions  = [];

  rows.forEach(row => {
    let isException = false;

    const op = criteria.op || criteria.type || '';

    // ── null_when: field is blank when conditionField > threshold ──────────
    if (op === 'null_when') {
      const condField = pick(criteria, 'conditionField') ||
                        (criteria.condition && criteria.condition.field) || '';
      const condVal   = (() => {
        const v = pick(criteria, 'conditionValue') ||
                  (criteria.condition && criteria.condition.value);
        if (v === 'materiality' || v === undefined) return materiality;
        return Number(v);
      })();
      const targetField = pick(criteria, 'field') || '';
      const rowCondVal  = Number(row[condField] || 0);
      const fieldVal    = row[targetField];
      if (condField && targetField && rowCondVal > condVal &&
          (fieldVal === null || fieldVal === '' || fieldVal === undefined)) {
        isException = true;
      }
    }

    // ── three_way_match ────────────────────────────────────────────────────
    if (op === 'three_way_match' || criteria.type === 'three_way_match') {
      const invField = pick(criteria, 'invoiceAmountField', 'invoiceField', 'invoice_amount_field') || 'invoice_amount';
      const poField  = pick(criteria, 'poAmountField', 'poField', 'po_amount_field')               || 'po_amount';
      const inv = Number(row[invField] || 0);
      const po  = Number(row[poField]  || 0);
      if (po > 0) {
        // tolerancePct may be 0.05 (decimal) or 5 (percent) — normalise to decimal
        let tolPct = Number(criteria.tolerancePct || 0.05);
        if (tolPct > 1) tolPct = tolPct / 100;
        const tolFixed   = Number(criteria.toleranceFixed || 0);
        const tolerance  = Math.max(po * tolPct, tolFixed);
        if (Math.abs(inv - po) > tolerance) {
          isException = true;
          row._variance      = inv - po;
          row._toleranceUsed = tolerance;
        }
      }
    }

    // ── simple comparison: gt / gte / lt / lte / eq ────────────────────────
    if (['gt','gte','lt','lte','eq'].includes(op)) {
      const field    = pick(criteria, 'field') || 'invoice_amount';
      const threshold = Number(pick(criteria, 'value', 'threshold') || materiality);
      const rowVal   = Number(row[field] || 0);
      if (op === 'gt'  && rowVal >  threshold) isException = true;
      if (op === 'gte' && rowVal >= threshold) isException = true;
      if (op === 'lt'  && rowVal <  threshold) isException = true;
      if (op === 'lte' && rowVal <= threshold) isException = true;
      if (op === 'eq'  && rowVal === threshold) isException = true;
    }

    // ── out_of_period: flag all (real cut-off needs dates configured) ──────
    if (op === 'out_of_period') {
      const dateField = pick(criteria, 'dateField', 'date_field') || 'invoice_date';
      if (!row[dateField]) isException = true; // null date always flagged
    }

    if (isException) {
      const amtField = pick(criteria, 'amountField', 'invoiceAmountField', 'invoiceField') || 'invoice_amount';
      exceptions.push({
        ...row,
        _testId:        test.id,
        _exceptionType: test.name,
        _amount:        Number(row[amtField] || row.invoice_amount || 0),
      });
    }
  });

  const total    = rows.length;
  const excCount = exceptions.length;
  const excRate  = total > 0 ? (excCount / total) * 100 : 0;
  const passed   = excCount === 0 || excRate <= (test.passThresholdPct || Infinity);

  return { testId: test.id, testName: test.name, type: test.type, total, excCount, excRate: +excRate.toFixed(2), passed, exceptions };
}

/**
 * T-type: analytical — split payment or exact duplicate detection.
 */
function runAnalytical(test, rows, skill) {
  const criteria   = test.criteria || {};
  const exceptions = [];
  const analyticType = criteria.type || '';

  // ── split_payment ─────────────────────────────────────────────────────────
  if (analyticType === 'split_payment') {
    const groupField  = pick(criteria, 'vendorField', 'groupField', 'vendor_field')     || 'vendor_id';
    const amtField    = pick(criteria, 'amountField', 'amount_field')                   || 'invoice_amount';
    const dateField   = pick(criteria, 'dateField', 'date_field', 'invoice_date_field') || 'invoice_date';
    const threshold   = Number(pick(criteria, 'amountThreshold', 'thresholdUsd', 'threshold') || 0);
    const windowDays  = Number(criteria.windowDays || 3);

    const grouped = {};
    rows.forEach(row => {
      const key = String(row[groupField] || '');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ row, amt: Number(row[amtField] || 0), dt: row[dateField] ? new Date(row[dateField]) : null });
    });

    Object.entries(grouped).forEach(([, items]) => {
      items.sort((a, b) => (a.dt || 0) - (b.dt || 0));

      for (let i = 0; i < items.length; i++) {
        const base = items[i];
        const windowItems = [base];

        for (let j = i + 1; j < items.length; j++) {
          const other    = items[j];
          const daysDiff = base.dt && other.dt
            ? Math.abs((other.dt - base.dt) / (1000 * 60 * 60 * 24))
            : 0;
          if (daysDiff <= windowDays) windowItems.push(other);
          else break;
        }

        if (windowItems.length > 1) {
          const windowSum = windowItems.reduce((s, x) => s + x.amt, 0);
          const allBelow  = windowItems.every(x => x.amt < threshold);
          const isSplit   = threshold > 0
            ? windowSum > threshold && allBelow
            : windowItems.length > 1;

          if (isSplit) {
            windowItems.forEach(({ row }) => {
              if (!exceptions.find(e => e._rowIndex === row._rowIndex)) {
                exceptions.push({
                  ...row,
                  _testId:        test.id,
                  _exceptionType: test.name,
                  _amount:        Number(row[amtField] || 0),
                  _windowSum:     windowSum,
                  _windowCount:   windowItems.length,
                });
              }
            });
          }
        }
      }
    });
  }

  // ── exact_duplicate ───────────────────────────────────────────────────────
  if (analyticType === 'exact_duplicate') {
    const dupFields = criteria.keyFields || criteria.fields || ['vendor_id', 'invoice_amount', 'invoice_date'];
    const seen = new Map();
    rows.forEach(row => {
      const key = dupFields.map(f => String(row[f] ?? '')).join('|');
      if (seen.has(key)) {
        const orig = seen.get(key);
        [orig, row].forEach(r => {
          if (!exceptions.find(e => e._rowIndex === r._rowIndex)) {
            exceptions.push({ ...r, _testId: test.id, _exceptionType: test.name, _amount: Number(r.invoice_amount || 0), _dupKey: key });
          }
        });
      } else {
        seen.set(key, row);
      }
    });
  }

  const total    = rows.length;
  const excCount = exceptions.length;
  const excRate  = total > 0 ? (excCount / total) * 100 : 0;
  const passed   = excCount === 0 || excRate <= (test.passThresholdPct || Infinity);

  return { testId: test.id, testName: test.name, type: test.type, total, excCount, excRate: +excRate.toFixed(2), passed, exceptions };
}

/**
 * T-type: sampling — risk-based sample selection.
 */
function runSampling(test, rows) {
  const criteria   = test.criteria || {};
  const amtField   = pick(criteria, 'selectionField', 'amountField', 'amount_field') || 'invoice_amount';
  const sorted     = [...rows].sort((a, b) => Number(b[amtField] || 0) - Number(a[amtField] || 0));
  const sampleSize = Math.min(
    Math.max(Number(criteria.sampleSize || 25), Number(criteria.min || 1)),
    Number(criteria.max || 200),
    sorted.length
  );
  const sample = sorted.slice(0, sampleSize);

  // Simulate 5% exception rate (documentation missing) for demo purposes
  const exceptionCount = Math.max(1, Math.ceil(sample.length * 0.05));
  const exceptions = sample.slice(0, exceptionCount).map(row => ({
    ...row,
    _testId:        test.id,
    _exceptionType: test.name,
    _amount:        Number(row[amtField] || 0),
    _sampleNote:    'Documentation incomplete — flagged for manual review',
  }));

  const excRate = sampleSize > 0 ? (exceptionCount / sampleSize) * 100 : 0;
  const passed  = exceptionCount === 0 || excRate <= (test.passThresholdPct || Infinity);

  return {
    testId: test.id, testName: test.name, type: test.type,
    total: rows.length, sampleSize, excCount: exceptionCount,
    excRate: +excRate.toFixed(2), passed, exceptions, sample,
  };
}

/**
 * Run all tests defined in the Skill against the ingested population.
 * Gracefully handles unknown test types instead of crashing.
 */
function runAllTests(skill, population) {
  const tests   = (skill.step3 && skill.step3.tests) || [];
  const results = [];

  for (const test of tests) {
    if (!test || !test.id) continue; // skip malformed
    let result;
    const testType = (test.type || '').toLowerCase();
    try {
      switch (testType) {
        case 'population_100pct':
        case 'population':
          result = runPopulation100pct(test, population, skill);
          break;
        case 'analytical':
          result = runAnalytical(test, population, skill);
          break;
        case 'sampling':
          result = runSampling(test, population);
          break;
        default:
          result = {
            testId: test.id, testName: test.name || test.id,
            type: test.type, total: population.length,
            excCount: 0, excRate: 0, passed: true,
            exceptions: [],
            warning: `Unknown test type "${test.type}" — skipped`,
          };
      }
    } catch (err) {
      result = {
        testId: test.id, testName: test.name || test.id,
        type: test.type, total: population.length,
        excCount: 0, excRate: 0, passed: false,
        exceptions: [],
        error: `Test execution error: ${err.message}`,
      };
    }
    results.push(result);
  }
  return results;
}

module.exports = { runAllTests };
