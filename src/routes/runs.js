const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const db         = require('../store/db');
const { ingest } = require('../engine/ingestion');
const { runAllTests } = require('../engine/testRunner');
const { classify }   = require('../engine/classifier');
const { generateExcel } = require('../engine/excelExporter');
const { generatePDF }   = require('../engine/pdfExporter');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// In-memory cache for ingestion data (large, not persisted)
const ingestionCache = new Map();

// GET /api/runs
router.get('/', (req, res) => {
  const runs = db.getRuns().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  res.json(runs);
});

// GET /api/runs/:id
router.get('/:id', (req, res) => {
  const run = db.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// POST /api/runs — start a new audit run
router.post('/', upload.single('dataFile'), async (req, res) => {
  try {
    const { skillId, runName } = req.body;
    if (!skillId) return res.status(400).json({ error: 'skillId is required' });

    const skill = db.getSkill(skillId);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    const runId = uuidv4();
    const now = new Date().toISOString();

    // Create run record (pending)
    const run = {
      id: runId, skillId, skillVersion: skill.version,
      name: runName || `${skill.name} — Run ${new Date().toLocaleDateString()}`,
      status: 'running',
      startedAt: now, completedAt: null,
      progress: { stage: 'Ingesting data', pct: 10 },
      inScopeRows: 0, excludedRows: 0, totalExceptions: 0, totalExposure: 0,
      testResults: [], findings: [],
    };
    db.upsertRun(run);

    // Run asynchronously and return run ID immediately
    res.status(202).json({ runId, status: 'running' });

    // ── Async execution ──────────────────────────────────────────────────────
    setImmediate(async () => {
      try {
        const buffer = req.file?.buffer;
        const filename = req.file?.originalname || 'upload.xlsx';
        let ingestionData;

        if (buffer) {
          // Real file uploaded
          ingestionData = ingest(buffer, filename, skill);
        } else {
          // No file — generate synthetic demo data
          ingestionData = generateDemoData(skill);
        }

        ingestionCache.set(runId, ingestionData);

        run.progress = { stage: 'Running tests', pct: 40 };
        run.inScopeRows = ingestionData.population.length;
        run.excludedRows = ingestionData.excluded.length;
        db.upsertRun(run);

        // Execute all tests
        const testResults = runAllTests(skill, ingestionData.population);
        run.testResults = testResults;
        run.progress = { stage: 'Classifying findings', pct: 80 };
        db.upsertRun(run);

        // Classify findings
        const findings = classify(testResults, skill, runId);
        run.totalExceptions = findings.reduce((s, f) => s + f.exceptionCount, 0);
        run.totalExposure = findings.reduce((s, f) => s + (f.monetaryExposure || 0), 0);
        run.findings = findings.map(f => f.id);
        run.status = 'complete';
        run.completedAt = new Date().toISOString();
        run.progress = { stage: 'Complete', pct: 100 };
        run.dataQuality = ingestionData.quality;
        db.upsertRun(run);

        // Save findings
        db.saveManyFindings(findings);

        // Update skill run count
        skill.runCount = (skill.runCount || 0) + 1;
        db.upsertSkill(skill);

      } catch (err) {
        run.status = 'error';
        run.error = err.message;
        run.completedAt = new Date().toISOString();
        db.upsertRun(run);
        console.error('Run error:', err);
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/runs/:id/export/excel
router.get('/:id/export/excel', async (req, res) => {
  try {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'complete') return res.status(400).json({ error: 'Run not complete' });

    const skill = db.getSkill(run.skillId);
    const findings = (run.findings || []).map(id => db.getFinding(id)).filter(Boolean);
    const ingestionData = ingestionCache.get(run.id) || { population: [], excluded: [], quality: run.dataQuality || {} };

    const buffer = await generateExcel(run, skill, ingestionData, findings);
    const safeName = skill.name.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="AuditSkills_WorkingPaper_${safeName}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/runs/:id/export/pdf
router.get('/:id/export/pdf', async (req, res) => {
  try {
    const run = db.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'complete') return res.status(400).json({ error: 'Run not complete' });

    const skill = db.getSkill(run.skillId);
    const findings = (run.findings || []).map(id => db.getFinding(id)).filter(Boolean);

    const buffer = await generatePDF(run, skill, findings);
    const safeName = skill.name.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="AuditSkills_FindingsReport_${safeName}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Synthetic demo data generator ─────────────────────────────────────────────
// Dynamically generates demo rows based on the skill's field mappings so
// that ANY skill (not just the seeded AP ones) produces meaningful test data.

function generateDemoData(skill) {
  const fieldMappings = (skill.step2 && skill.step2.fieldMappings) || [];
  const materiality   = (skill.step1 && skill.step1.materialityUsd) || 10000;
  const tests         = (skill.step3 && skill.step3.tests) || [];

  // Build a map of logicalName → { type, required, ... }
  const fields = {};
  fieldMappings.forEach(fm => {
    const key  = fm.logicalName || fm.canonicalName || '';
    const type = (fm.dataType || fm.type || 'Text').toLowerCase();
    if (key) fields[key] = { type, required: fm.required, nullHandling: fm.nullHandling || 'pass_through' };
  });

  const fieldNames = Object.keys(fields);

  // ── Helper generators per data type ──────────────────────────────────────
  const vendors  = ['VND-001','VND-002','VND-003','VND-004','VND-005','VND-006','VND-007','ACM-0047'];
  const people   = ['USR-10','USR-11','USR-12','USR-13','USR-14'];
  const randomDate = (base, rangeDays) => {
    const d = new Date(base); d.setDate(d.getDate() + Math.floor(Math.random() * rangeDays));
    return d.toISOString().slice(0, 10);
  };
  const randomAmount   = (min, max) => Math.round((Math.random() * (max - min) + min) * 100) / 100;
  const randomId       = (prefix, i) => `${prefix}-${String(i).padStart(5, '0')}`;
  const randomVendor   = () => vendors[Math.floor(Math.random() * vendors.length)];
  const randomPerson   = () => people[Math.floor(Math.random() * people.length)];
  const randomInt      = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function generateValue(key, ft, rowIndex, opts = {}) {
    const type = ft.type;
    const k    = key.toLowerCase();

    // Amount / currency fields
    if (type === 'currency' || type === 'number' || k.includes('amount') || k.includes('value') || k.includes('total') || k.includes('cost') || k.includes('price')) {
      if (opts.forceNull) return null;
      if (opts.amountOverride !== undefined) return opts.amountOverride;
      return randomAmount(500, materiality * 4);
    }
    // Integer fields (days, counts, etc.)
    if (type === 'integer' || k.includes('days') || k.includes('count') || k.includes('qty') || k.includes('quantity')) {
      if (opts.intOverride !== undefined) return opts.intOverride;
      return randomInt(0, 120);
    }
    // Date fields
    if (type === 'date' || k.includes('date') || k.includes('_dt') || k.includes('timestamp')) {
      if (opts.dateOverride) return opts.dateOverride;
      return randomDate('2025-04-01', 180);
    }
    // Boolean
    if (type === 'boolean') return Math.random() > 0.2;
    // Vendor / supplier / entity ID
    if (k.includes('vendor') || k.includes('supplier') || k.includes('entity') || k.includes('customer') || k.includes('partner')) {
      if (opts.vendorOverride) return opts.vendorOverride;
      if (opts.forceNull) return null;
      return randomVendor();
    }
    // PO / reference / approval
    if (k.includes('po') || k.includes('purchase_order') || k.includes('order') || k.includes('ref')) {
      if (opts.forceNull) return null;
      if (opts.skipOptional && !ft.required) return null;
      return randomId('PO', rowIndex);
    }
    // Approver / user
    if (k.includes('approver') || k.includes('user') || k.includes('reviewer') || k.includes('owner')) {
      if (opts.forceNull) return null;
      return randomPerson();
    }
    // ID field (primary key)
    if (k.includes('_id') || k === 'id' || k.includes('number') || k.includes('num') || k.includes('code')) {
      return randomId(key.replace(/_/g, '').slice(0, 3).toUpperCase(), 1000 + rowIndex);
    }
    // Name / description / text
    if (k.includes('name') || k.includes('desc') || k.includes('note') || k.includes('comment') || k.includes('reason')) {
      const labels = ['Standard transaction', 'Monthly service fee', 'Quarterly supply', 'Maintenance charge', 'Consulting fee', 'Software license', 'Hardware purchase'];
      return labels[rowIndex % labels.length];
    }
    // Status
    if (k.includes('status') || k.includes('state')) {
      return ['Active', 'Pending', 'Approved', 'Processed'][rowIndex % 4];
    }
    // Default text
    return `VAL-${String(rowIndex).padStart(4, '0')}`;
  }

  // ── Generate 150 normal rows ─────────────────────────────────────────────
  const rows = [];
  for (let i = 0; i < 150; i++) {
    const row = { _rowIndex: i + 2 };
    for (const [key, ft] of Object.entries(fields)) {
      row[key] = generateValue(key, ft, i);
    }
    rows.push(row);
  }

  // ── Inject exceptions that match the skill's tests ───────────────────────
  // Scan tests to understand what kind of exceptions to create

  for (const test of tests) {
    const crit = test.criteria || {};
    const testType = (test.type || '').toLowerCase();

    // null_when tests — inject rows where the target field is null AND condition met
    if (crit.op === 'null_when') {
      const nullField = crit.field || '';
      const condField = crit.conditionField || (crit.condition && crit.condition.field) || '';
      const condValue = crit.conditionValue || (crit.condition && crit.condition.value) || materiality;
      for (let i = 0; i < 6; i++) {
        const row = { _rowIndex: 200 + i };
        for (const [key, ft] of Object.entries(fields)) {
          if (key === nullField) { row[key] = null; }
          else if (key === condField) { row[key] = Number(condValue) + 2000 + i * 1500; }
          else { row[key] = generateValue(key, ft, 200 + i); }
        }
        rows.push(row);
      }
    }

    // three_way_match tests — inject rows with large variance
    if (crit.type === 'three_way_match') {
      const invField = crit.invoiceAmountField || crit.invoiceField || 'invoice_amount';
      const poField  = crit.poAmountField || crit.poField || 'po_amount';
      for (let i = 0; i < 8; i++) {
        const poAmt = 15000 + i * 2000;
        const row = { _rowIndex: 210 + i };
        for (const [key, ft] of Object.entries(fields)) {
          if (key === invField) { row[key] = poAmt * 1.15; }   // 15% variance
          else if (key === poField) { row[key] = poAmt; }
          else { row[key] = generateValue(key, ft, 210 + i); }
        }
        rows.push(row);
      }
    }

    // split_payment — inject a vendor cluster within a tight date window
    if (crit.type === 'split_payment') {
      const vendorField = crit.vendorField || crit.groupField || 'vendor_id';
      const amtField    = crit.amountField || 'invoice_amount';
      const dateField   = crit.dateField   || 'invoice_date';
      const threshold   = Number(crit.amountThreshold || crit.thresholdUsd || materiality);
      const splitVendor = 'ACM-0047';
      ['2025-08-10','2025-08-11','2025-08-12'].forEach((dt, i) => {
        const row = { _rowIndex: 230 + i };
        for (const [key, ft] of Object.entries(fields)) {
          if (key === vendorField) { row[key] = splitVendor; }
          else if (key === amtField) { row[key] = Math.round(threshold * 0.4) + i * 100; }
          else if (key === dateField) { row[key] = dt; }
          else { row[key] = generateValue(key, ft, 230 + i); }
        }
        rows.push(row);
      });
    }

    // exact_duplicate — inject 4 duplicate rows
    if (crit.type === 'exact_duplicate') {
      const dupFields = crit.keyFields || crit.fields || [];
      const template = { _rowIndex: 240 };
      for (const [key, ft] of Object.entries(fields)) {
        template[key] = generateValue(key, ft, 240);
      }
      for (let i = 0; i < 4; i++) {
        const dup = { ...template, _rowIndex: 241 + i };
        // Keep duplicate key fields identical
        for (const [key, ft] of Object.entries(fields)) {
          if (!dupFields.includes(key)) dup[key] = generateValue(key, ft, 241 + i);
        }
        rows.push(dup);
      }
    }

    // gt / gte — inject rows above the threshold
    if (['gt', 'gte'].includes(crit.op)) {
      const field = crit.field || 'invoice_amount';
      const val   = Number(crit.value || materiality);
      for (let i = 0; i < 5; i++) {
        const row = { _rowIndex: 250 + i };
        for (const [key, ft] of Object.entries(fields)) {
          if (key === field) { row[key] = val + 5000 + i * 3000; }
          else { row[key] = generateValue(key, ft, 250 + i); }
        }
        rows.push(row);
      }
    }
  }

  // ── Apply exclusions ─────────────────────────────────────────────────────
  const excluded   = [];
  const population = rows.filter(r => {
    // Check common vendor fields for intercompany prefix
    for (const key of fieldNames) {
      if (key.includes('vendor') || key.includes('supplier')) {
        if (String(r[key] || '').toLowerCase().startsWith('ic-')) {
          excluded.push({ ...r, _exclusionReason: 'intercompany_transactions' });
          return false;
        }
      }
    }
    return true;
  });

  // ── Quality report ───────────────────────────────────────────────────────
  const nullRates = {};
  for (const [key] of Object.entries(fields)) {
    const nullCount = population.filter(r => r[key] === null || r[key] === '' || r[key] === undefined).length;
    nullRates[key] = { nullCount, rate: population.length ? +((nullCount / population.length) * 100).toFixed(1) : 0 };
  }

  const quality = {
    totalRows: rows.length,
    rejectedRows: 0,
    duplicateRows: 0,
    inScopeRows: population.length,
    nullRates,
    blocked: false,
    blockReasons: [],
    warnings: [],
  };

  return { population, excluded, duplicates: [], rejects: [], warnings: [], quality, totalRows: rows.length, columnMappings: {} };
}

module.exports = router;
