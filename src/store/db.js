/**
 * AuditSkills — In-memory store with JSON-file persistence
 * Seed data mirrors the blueprint sample skill (Vendor Invoice Completeness – AP)
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data/db.json');

// ─── Seed data ──────────────────────────────────────────────────────────────
const SEED = {
  skills: [
    {
      id: 'sk_ap_vendor_invoice_001',
      name: 'Vendor Invoice Completeness – AP',
      shortDescription: 'Three-way match, PO completeness, and split-payment detection for AP invoices above materiality.',
      version: '2.1',
      status: 'master',
      registryLevel: 'organisation',
      qualityBadge: 'org_approved',
      runCount: 38,
      step1: {
        auditObjective: 'Test that all vendor invoices greater than $10,000 have an approved purchase order and a matching goods receipt on file. Identify any payments made without dual-authorisation controls and detect potential split-payment schemes.',
        assertions: ['Completeness', 'Accuracy', 'Existence'],
        auditPeriod: { label: 'FY2025 Q3', start: '2025-07-01', end: '2025-09-30' },
        materialityUsd: 10000,
        inherentRisk: 'High',
        population: 'All AP invoices posted to ERP during the audit period',
        exclusions: ['intercompany_transactions', 'prepaid_invoices', 'credit_notes'],
        responsibleAuditor: { name: 'Jane Smith', role: 'Senior Internal Auditor', email: 'jane.smith@acme.com' },
      },
      step2: {
        fieldMappings: [
          { canonicalName: 'invoice_id',     type: 'ID',       required: true,         nullHandling: 'reject_row',       hint: 'Invoice No.' },
          { canonicalName: 'invoice_date',   type: 'Date',     required: true,         nullHandling: 'reject_row',       hint: 'Invoice Date' },
          { canonicalName: 'invoice_amount', type: 'Currency', required: true,         nullHandling: 'reject_row',       hint: 'Amount' },
          { canonicalName: 'vendor_id',      type: 'ID',       required: true,         nullHandling: 'flag_for_review',  hint: 'Vendor ID' },
          { canonicalName: 'po_number',      type: 'Text',     required: 'conditional', nullHandling: 'flag_as_exception', hint: 'PO Number' },
          { canonicalName: 'approver_id',    type: 'ID',       required: true,         nullHandling: 'flag_for_review',  hint: 'Approved By' },
          { canonicalName: 'po_amount',      type: 'Currency', required: false,        nullHandling: 'substitute_zero',  hint: 'PO Amount' },
          { canonicalName: 'vendor_name',    type: 'Text',     required: false,        nullHandling: 'substitute_blank', hint: 'Vendor Name' },
        ],
        dedupKeys: ['invoice_id'],
        qualityGate: { maxNullRateBlocking: 0.10, maxDupRateBlocking: 0.05, minRowCount: 5 },
      },
      step3: {
        tests: [
          {
            id: 'T01',
            name: 'Invoices Without Approved PO',
            objective: 'Identify all invoices above materiality threshold processed without a valid PO reference.',
            type: 'population_100pct',
            assertions: ['Completeness', 'Existence'],
            criteria: { field: 'po_number', op: 'null_when', conditionField: 'invoice_amount', conditionOp: 'gt', conditionValue: 'materiality' },
            passThresholdPct: 0,
          },
          {
            id: 'T02',
            name: 'Three-Way Match Variance',
            objective: 'Identify invoices where the invoiced amount differs from the PO amount beyond tolerance.',
            type: 'population_100pct',
            assertions: ['Accuracy', 'Valuation'],
            criteria: { type: 'three_way_match', invoiceField: 'invoice_amount', poField: 'po_amount', tolerancePct: 2, toleranceFixed: 500 },
            passThresholdPct: 2,
          },
          {
            id: 'T03',
            name: 'Split Payment Detection',
            objective: 'Detect potential invoice-splitting where same vendor submits invoices below threshold that cumulatively exceed it.',
            type: 'analytical',
            assertions: ['Completeness'],
            criteria: { type: 'split_payment', groupField: 'vendor_id', amountField: 'invoice_amount', windowDays: 3, thresholdUsd: 10000 },
            passThresholdPct: 0,
          },
          {
            id: 'T04',
            name: 'High-Value Invoice Sample Review',
            objective: 'Risk-based sample of highest-value invoices to verify documentation completeness.',
            type: 'sampling',
            assertions: ['Existence', 'Completeness'],
            criteria: { type: 'sampling', basis: 'invoice_amount', method: 'risk_based', sampleSize: 25, min: 10, max: 60 },
            passThresholdPct: 5,
          },
        ],
      },
      step4: {
        classificationRules: [
          { testId: 'T01', defaultRisk: 'High',   category: 'Control Deficiency', followUp: true,  escalation: [] },
          { testId: 'T02', defaultRisk: 'Medium',  category: 'Process Gap',        followUp: true,  escalation: [{ ifAmountGt: 50000, thenRisk: 'High' }, { ifCountGte: 3, thenRisk: 'High' }] },
          { testId: 'T03', defaultRisk: 'High',   category: 'Fraud Indicator',    followUp: true,  escalation: [] },
          { testId: 'T04', defaultRisk: 'Medium',  category: 'Control Deficiency', followUp: true,  escalation: [{ ifRatePctGt: 10, thenRisk: 'High' }] },
        ],
        followUpPolicy: { requiredIfRisk: ['High'], deadlineDays: { High: 30, Medium: 60, Low: 90 } },
        recommendedActions: {
          T01: 'Management should investigate each exception, obtain retroactive PO documentation where available, and implement a system-level preventive control to block payments without a valid PO reference above the materiality threshold.',
          T02: 'Management should review each variance, document the business rationale, and ensure three-way match reconciliation is evidenced for all invoices above materiality prior to payment release.',
          T03: 'Management must investigate each split-payment cluster with urgency. Engage the fraud investigation team if the pattern cannot be explained by a legitimate blanket order. Place vendor under enhanced monitoring.',
          T04: 'Management should ensure all required documentation is obtained and implement a documentation checklist at the point of invoice approval.',
        },
      },
      meta: {
        createdBy: 'jane.smith@acme.com',
        createdAt: '2025-02-10T09:00:00Z',
        lastModifiedAt: '2026-04-05T11:22:00Z',
        tags: ['accounts-payable', 'completeness', 'three-way-match', 'fraud-detection'],
        category: 'Accounts Payable',
        avgRunTimeSec: 4,
      },
      versions: [
        { version: '1.0', date: '2025-02-10', author: 'jane.smith@acme.com', changes: 'Initial — T01 only. Threshold $5,000.', outcomes: { exceptions: 89, exposure: 4100000 } },
        { version: '1.4', date: '2025-03-21', author: 'jane.smith@acme.com', changes: 'Added T02. Tightened tolerance ±5%→±2%.', outcomes: { exceptions: 52, exposure: 3400000 } },
        { version: '2.0', date: '2025-04-03', author: 'jane.smith@acme.com', changes: 'Added T03 split-payment + T04 sampling.', outcomes: { exceptions: 47, exposure: 3200000 } },
        { version: '2.1', date: '2026-04-05', author: 'jane.smith@acme.com', changes: 'Threshold $5k→$10k. T03 window 7→3 days. Exception count −70%.', outcomes: { exceptions: 14, exposure: 2400000 }, promoted: true },
      ],
    },
    {
      id: 'sk_ap_duplicate_002',
      name: 'AP Duplicate Payment Detection',
      shortDescription: 'Identifies duplicate payments using vendor + amount + date proximity. Flags split invoices below approval thresholds.',
      version: '1.4',
      status: 'master',
      registryLevel: 'organisation',
      qualityBadge: 'org_approved',
      runCount: 29,
      step1: {
        auditObjective: 'Detect duplicate payments to the same vendor for the same or similar amount within a rolling window, indicating potential fraud or processing error.',
        assertions: ['Completeness', 'Accuracy'],
        auditPeriod: { label: 'FY2025 Q3', start: '2025-07-01', end: '2025-09-30' },
        materialityUsd: 1000,
        inherentRisk: 'High',
        population: 'All AP payments processed in the period',
        exclusions: ['intercompany_transactions'],
        responsibleAuditor: { name: 'Jane Smith', role: 'Senior Internal Auditor', email: 'jane.smith@acme.com' },
      },
      step2: {
        fieldMappings: [
          { canonicalName: 'invoice_id',     type: 'ID',       required: true,  nullHandling: 'reject_row',      hint: 'Invoice No.' },
          { canonicalName: 'invoice_date',   type: 'Date',     required: true,  nullHandling: 'reject_row',      hint: 'Invoice Date' },
          { canonicalName: 'invoice_amount', type: 'Currency', required: true,  nullHandling: 'reject_row',      hint: 'Amount' },
          { canonicalName: 'vendor_id',      type: 'ID',       required: true,  nullHandling: 'flag_for_review', hint: 'Vendor ID' },
          { canonicalName: 'vendor_name',    type: 'Text',     required: false, nullHandling: 'substitute_blank', hint: 'Vendor Name' },
        ],
        dedupKeys: ['invoice_id'],
        qualityGate: { maxNullRateBlocking: 0.10, maxDupRateBlocking: 0.05, minRowCount: 5 },
      },
      step3: {
        tests: [
          {
            id: 'T01',
            name: 'Exact Duplicate Invoices',
            objective: 'Find invoices with identical vendor + amount + date — exact duplicates.',
            type: 'analytical',
            assertions: ['Completeness'],
            criteria: { type: 'exact_duplicate', fields: ['vendor_id', 'invoice_amount', 'invoice_date'] },
            passThresholdPct: 0,
          },
          {
            id: 'T02',
            name: 'Near-Duplicate Payments (Same Vendor, ±5 days)',
            objective: 'Detect same-vendor payments of the same amount within a 5-day window.',
            type: 'analytical',
            assertions: ['Completeness'],
            criteria: { type: 'split_payment', groupField: 'vendor_id', amountField: 'invoice_amount', windowDays: 5, thresholdUsd: 1000, exactMatch: true },
            passThresholdPct: 0,
          },
        ],
      },
      step4: {
        classificationRules: [
          { testId: 'T01', defaultRisk: 'High',  category: 'Fraud Indicator',    followUp: true,  escalation: [] },
          { testId: 'T02', defaultRisk: 'Medium', category: 'Process Gap',        followUp: true,  escalation: [] },
        ],
        followUpPolicy: { requiredIfRisk: ['High'], deadlineDays: { High: 30, Medium: 60 } },
        recommendedActions: {
          T01: 'Investigate each duplicate pair immediately. Recover overpayments where duplicate payments were made. Review AP system controls to prevent future duplicate processing.',
          T02: 'Review near-duplicate clusters and determine if legitimate repeat deliveries or error payments. Implement system-level duplicate detection at time of invoice entry.',
        },
      },
      meta: {
        createdBy: 'jane.smith@acme.com',
        createdAt: '2025-03-01T09:00:00Z',
        lastModifiedAt: '2026-03-15T14:00:00Z',
        tags: ['accounts-payable', 'duplicate', 'fraud-detection'],
        category: 'Accounts Payable',
        avgRunTimeSec: 2,
      },
      versions: [
        { version: '1.4', date: '2026-03-15', author: 'jane.smith@acme.com', changes: 'Current master.', outcomes: { exceptions: 3, exposure: 14200 }, promoted: true },
      ],
    },
  ],
  runs: [],
  findings: [],
};

// ─── Store class ─────────────────────────────────────────────────────────────
class Store {
  constructor() {
    this._data = null;
  }

  _load() {
    if (this._data) return;
    try {
      if (fs.existsSync(DATA_FILE)) {
        this._data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      } else {
        this._data = JSON.parse(JSON.stringify(SEED));
        this._save();
      }
    } catch {
      this._data = JSON.parse(JSON.stringify(SEED));
    }
  }

  _save() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(this._data, null, 2)); } catch {}
  }

  // ── Skills ────────────────────────────────────────────────────────────────
  getSkills() { this._load(); return this._data.skills; }
  getSkill(id) { this._load(); return this._data.skills.find(s => s.id === id) || null; }
  upsertSkill(skill) {
    this._load();
    const idx = this._data.skills.findIndex(s => s.id === skill.id);
    if (idx >= 0) this._data.skills[idx] = skill;
    else this._data.skills.push(skill);
    this._save();
    return skill;
  }

  // ── Runs ──────────────────────────────────────────────────────────────────
  getRuns() { this._load(); return this._data.runs; }
  getRun(id) { this._load(); return this._data.runs.find(r => r.id === id) || null; }
  upsertRun(run) {
    this._load();
    const idx = this._data.runs.findIndex(r => r.id === run.id);
    if (idx >= 0) this._data.runs[idx] = run;
    else this._data.runs.push(run);
    this._save();
    return run;
  }

  // ── Findings ──────────────────────────────────────────────────────────────
  getFindings() { this._load(); return this._data.findings; }
  getFinding(id) { this._load(); return this._data.findings.find(f => f.id === id) || null; }
  upsertFinding(finding) {
    this._load();
    const idx = this._data.findings.findIndex(f => f.id === finding.id);
    if (idx >= 0) this._data.findings[idx] = finding;
    else this._data.findings.push(finding);
    this._save();
    return finding;
  }
  saveManyFindings(findings) {
    this._load();
    findings.forEach(f => {
      const idx = this._data.findings.findIndex(x => x.id === f.id);
      if (idx >= 0) this._data.findings[idx] = f;
      else this._data.findings.push(f);
    });
    this._save();
  }
}

module.exports = new Store();
