/**
 * AuditSkills — Excel Working Paper Exporter
 * Generates a professional multi-tab Excel workbook using ExcelJS.
 */
const ExcelJS = require('exceljs');

// ─── Colour palette ──────────────────────────────────────────────────────────
const NAVY   = '1B3A6B';
const TEAL   = '0D7C7C';
const GOLD   = 'C8922A';
const WHITE  = 'FFFFFF';
const SMOKE  = 'F4F6F9';
const SILVER = 'DDE3EC';
const RED    = 'B91C1C';
const AMBER  = 'D97706';
const GREEN  = '15803D';
const RED_LT = 'FEE2E2';
const AMB_LT = 'FEF3C7';
const GRN_LT = 'DCFCE7';

function headerFill(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
}
function bgFill(color) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
}
function boldWhite(size) {
  return { name: 'Arial', size: size || 11, bold: true, color: { argb: 'FF' + WHITE } };
}
function bold(color, size) {
  return { name: 'Arial', size: size || 11, bold: true, color: { argb: 'FF' + (color || '1A1A1A') } };
}
function normal(color, size) {
  return { name: 'Arial', size: size || 10, color: { argb: 'FF' + (color || '1A1A1A') } };
}
const border = {
  top: { style: 'thin', color: { argb: 'FF' + SILVER } },
  left: { style: 'thin', color: { argb: 'FF' + SILVER } },
  bottom: { style: 'thin', color: { argb: 'FF' + SILVER } },
  right: { style: 'thin', color: { argb: 'FF' + SILVER } },
};
const riskColor = { High: RED, Medium: AMBER, Low: GREEN };
const riskBg = { High: RED_LT, Medium: AMB_LT, Low: GRN_LT };

function applyHeader(row, color) {
  row.eachCell(cell => {
    cell.fill = headerFill(color);
    cell.font = boldWhite(11);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  row.height = 28;
}

function applyDataRow(row, altBg) {
  row.eachCell(cell => {
    if (altBg) cell.fill = bgFill(SMOKE);
    cell.font = normal();
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  row.height = 22;
}

// ─── Sheet builders ───────────────────────────────────────────────────────────

function buildIndexSheet(wb, run, skill) {
  const ws = wb.addWorksheet('Index', { properties: { tabColor: { argb: 'FF' + NAVY } } });
  ws.columns = [{ width: 22 }, { width: 50 }, { width: 20 }];

  // Title block
  ws.mergeCells('A1:C1');
  const title = ws.getCell('A1');
  title.value = 'AuditSkills Working Paper — Index';
  title.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF' + WHITE } };
  title.fill = headerFill(NAVY);
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 42;

  // Metadata block
  const meta = [
    ['Skill Name', skill.name, ''],
    ['Audit Objective', skill.step1.auditObjective, ''],
    ['Audit Period', skill.step1.auditPeriod?.label || '', ''],
    ['Skill Version', run.skillVersion, ''],
    ['Run ID', run.id, ''],
    ['Run Date', new Date(run.completedAt).toLocaleString(), ''],
    ['Prepared By', skill.step1.responsibleAuditor?.name || 'Auditor', ''],
    ['Status', run.status, ''],
  ];
  meta.forEach(([label, value], i) => {
    const r = ws.addRow([label, value, '']);
    r.getCell(1).font = bold(NAVY);
    r.getCell(1).fill = bgFill(SMOKE);
    r.getCell(2).font = normal();
    r.eachCell(c => { c.border = border; c.alignment = { vertical: 'middle' }; });
    r.height = 20;
  });

  // Sheet directory
  ws.addRow([]);
  const dirHeader = ws.addRow(['Sheet', 'Contents', 'Status']);
  applyHeader(dirHeader, TEAL);

  const sheets = [
    ['Population', `${run.inScopeRows} in-scope rows · ${run.excludedRows} excluded`, '✓ Complete'],
    ['Data_Quality', 'Field null rates · Duplicates · Rejects', '✓ Complete'],
    ...(run.testResults || []).map(t => [
      `Test_${t.testId}`, `${t.testName} · ${t.excCount} exceptions · ${t.passed ? 'PASS' : 'FAIL'}`,
      t.passed ? '✓ PASS' : '✗ FAIL',
    ]),
    ['Exception_Register', `${run.totalExceptions} total exceptions · ${run.totalExposure ? '$' + run.totalExposure.toLocaleString() : '—'} exposure`, run.totalExceptions > 0 ? '⚠ Review Required' : '✓ Clean'],
    ['Finding_Summary', 'Risk breakdown · Exposure totals', '✓ Complete'],
    ['Sign_Off', 'Prepared by · Reviewed by · Approved by', 'Pending'],
  ];

  sheets.forEach(([sh, cont, status], i) => {
    const r = ws.addRow([sh, cont, status]);
    applyDataRow(r, i % 2 === 0);
    if (status.startsWith('✗')) r.getCell(3).font = bold(RED);
    if (status.startsWith('✓')) r.getCell(3).font = bold(GREEN);
    if (status.startsWith('⚠')) r.getCell(3).font = bold(AMBER);
  });
}

function buildPopulationSheet(wb, ingestionData) {
  const ws = wb.addWorksheet('Population', { properties: { tabColor: { argb: 'FF' + TEAL } } });
  const pop = ingestionData.population || [];
  if (pop.length === 0) { ws.addRow(['No data']); return; }

  const fields = Object.keys(pop[0]).filter(k => !k.startsWith('_'));
  ws.columns = fields.map(f => ({ header: f, key: f, width: Math.max(f.length + 4, 14) }));

  const hRow = ws.getRow(1);
  applyHeader(hRow, NAVY);

  pop.forEach((row, i) => {
    const r = ws.addRow(fields.map(f => row[f]));
    applyDataRow(r, i % 2 === 0);
  });

  // Excluded rows
  if (ingestionData.excluded?.length > 0) {
    ws.addRow([]);
    const exclHeader = ws.addRow(['--- EXCLUDED ROWS ---', ...Array(fields.length - 1).fill('')]);
    exclHeader.getCell(1).font = bold(RED);
    exclHeader.getCell(1).fill = bgFill(RED_LT);

    const excFields = Object.keys(ingestionData.excluded[0]).filter(k => !k.startsWith('_') || k === '_exclusionReason');
    const exHdr = ws.addRow(excFields);
    applyHeader(exHdr, RED);
    ingestionData.excluded.forEach((row, i) => {
      const r = ws.addRow(excFields.map(f => row[f]));
      applyDataRow(r, i % 2 === 0);
      r.eachCell(c => c.fill = bgFill(RED_LT));
    });
  }
}

function buildDataQualitySheet(wb, quality, ingestionData) {
  const ws = wb.addWorksheet('Data_Quality', { properties: { tabColor: { argb: 'FF' + GOLD } } });
  ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 18 }];

  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = 'Data Quality Report';
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF' + WHITE } };
  ws.getCell('A1').fill = headerFill(NAVY);
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // Summary stats
  const summaryRows = [
    ['Total Rows Ingested', quality.totalRows, '', ''],
    ['Rejected Rows', quality.rejectedRows, '', ''],
    ['Duplicate Rows Removed', quality.duplicateRows, '', ''],
    ['In-Scope Population', quality.inScopeRows, '', ''],
    ['Excluded (Scope)', ingestionData.excluded?.length || 0, '', ''],
    ['Status', quality.blocked ? 'BLOCKED ⛔' : 'PASSED ✓', '', ''],
  ];
  summaryRows.forEach(([label, value], i) => {
    const r = ws.addRow([label, value, '', '']);
    r.getCell(1).font = bold(NAVY);
    r.getCell(1).fill = bgFill(SMOKE);
    r.getCell(2).font = value === 'PASSED ✓' ? bold(GREEN) : value === 'BLOCKED ⛔' ? bold(RED) : bold();
    r.eachCell(c => { c.border = border; c.alignment = { vertical: 'middle' }; });
    r.height = 20;
  });

  ws.addRow([]);
  const nr = ws.addRow(['Field', 'Null Count', 'Null Rate %', 'Status']);
  applyHeader(nr, TEAL);

  Object.entries(quality.nullRates || {}).forEach(([field, { nullCount, rate }], i) => {
    const status = rate > 10 ? '⛔ BLOCKED' : rate > 2 ? '⚠ Warning' : '✓ OK';
    const r = ws.addRow([field, nullCount, rate + '%', status]);
    applyDataRow(r, i % 2 === 0);
    const statusCell = r.getCell(4);
    if (status.startsWith('⛔')) statusCell.font = bold(RED);
    else if (status.startsWith('⚠')) statusCell.font = bold(AMBER);
    else statusCell.font = bold(GREEN);
  });
}

function buildTestSheet(wb, testResult, skill) {
  const ws = wb.addWorksheet(`Test_${testResult.testId}`, {
    properties: { tabColor: { argb: 'FF' + (testResult.passed ? GREEN : RED) } },
  });

  // Test header
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `${testResult.testId} — ${testResult.testName}`;
  ws.getCell('A1').font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF' + WHITE } };
  ws.getCell('A1').fill = headerFill(testResult.passed ? GREEN : RED);
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // Stats
  const stats = [
    ['Test Type', testResult.type],
    ['Population Tested', testResult.total],
    ['Sample Size', testResult.sampleSize || 'N/A (100% population)'],
    ['Exceptions Found', testResult.excCount],
    ['Exception Rate', testResult.excRate + '%'],
    ['Pass Threshold', (skill.step3.tests.find(t => t.id === testResult.testId)?.passThresholdPct ?? 0) + '%'],
    ['Result', testResult.passed ? 'PASS ✓' : 'FAIL ✗'],
  ];
  stats.forEach(([k, v]) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = bold(NAVY);
    r.getCell(1).fill = bgFill(SMOKE);
    r.getCell(2).font = (v === 'PASS ✓' ? bold(GREEN) : v === 'FAIL ✗' ? bold(RED) : normal());
    r.eachCell(c => { c.border = border; c.alignment = { vertical: 'middle' }; });
    r.height = 20;
  });

  if (testResult.exceptions.length === 0) {
    ws.addRow([]);
    ws.addRow(['No exceptions found — test PASSED.']).getCell(1).font = bold(GREEN);
    return;
  }

  ws.addRow([]);
  const excCols = Object.keys(testResult.exceptions[0]).filter(k => !k.startsWith('_') || ['_variance', '_windowSum', '_windowCount', '_sampleNote'].includes(k));
  const hRow = ws.addRow(excCols);
  applyHeader(hRow, RED);
  ws.columns = excCols.map(c => ({ width: Math.max(c.length + 4, 14) }));

  testResult.exceptions.forEach((exc, i) => {
    const r = ws.addRow(excCols.map(c => exc[c]));
    applyDataRow(r, i % 2 === 0);
    r.eachCell(c => c.fill = bgFill(i % 2 === 0 ? RED_LT : 'FFF0F0'));
  });
}

function buildExceptionRegisterSheet(wb, findings) {
  const ws = wb.addWorksheet('Exception_Register', { properties: { tabColor: { argb: 'FF' + RED } } });
  ws.columns = [
    { width: 8 }, { width: 10 }, { width: 28 }, { width: 14 }, { width: 20 }, { width: 18 }, { width: 12 }, { width: 40 },
  ];

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'Exception Register — All Findings';
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF' + WHITE } };
  ws.getCell('A1').fill = headerFill(NAVY);
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  const hRow = ws.addRow(['Ref', 'Test', 'Finding', 'Risk', 'Category', 'Exposure', 'Status', 'Recommendation']);
  applyHeader(hRow, TEAL);

  findings.forEach((f, i) => {
    const r = ws.addRow([
      f.id, f.testId, f.condition, f.risk, f.category,
      f.monetaryExposure ? `$${f.monetaryExposure.toLocaleString()}` : '—',
      f.status, f.recommendation,
    ]);
    applyDataRow(r, i % 2 === 0);
    const riskCell = r.getCell(4);
    riskCell.font = bold(riskColor[f.risk] || '1A1A1A');
    riskCell.fill = bgFill(riskBg[f.risk] || SMOKE);
    r.getCell(8).alignment = { wrapText: true, vertical: 'top' };
    r.height = 48;
  });
}

function buildFindingSummarySheet(wb, findings, run) {
  const ws = wb.addWorksheet('Finding_Summary', { properties: { tabColor: { argb: 'FF' + GOLD } } });
  ws.columns = [{ width: 20 }, { width: 14 }, { width: 20 }];

  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = 'Finding Summary';
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF' + WHITE } };
  ws.getCell('A1').fill = headerFill(NAVY);
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  const hRow = ws.addRow(['Risk Level', 'Finding Count', 'Monetary Exposure']);
  applyHeader(hRow, TEAL);

  ['High', 'Medium', 'Low'].forEach(risk => {
    const group = findings.filter(f => f.risk === risk);
    const exp = group.reduce((s, f) => s + (f.monetaryExposure || 0), 0);
    const r = ws.addRow([risk, group.length, exp > 0 ? `$${exp.toLocaleString()}` : '—']);
    r.getCell(1).font = bold(riskColor[risk]);
    r.getCell(1).fill = bgFill(riskBg[risk]);
    r.getCell(2).alignment = { horizontal: 'center' };
    r.eachCell(c => c.border = border);
    r.height = 22;
  });

  ws.addRow([]);
  const totRow = ws.addRow(['TOTAL', findings.length, `$${(run.totalExposure || 0).toLocaleString()}`]);
  totRow.eachCell(c => { c.font = bold(NAVY); c.fill = bgFill(SMOKE); c.border = border; });
}

function buildSignOffSheet(wb, skill, run) {
  const ws = wb.addWorksheet('Sign_Off', { properties: { tabColor: { argb: 'FF' + NAVY } } });
  ws.columns = [{ width: 24 }, { width: 36 }, { width: 20 }];

  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = 'Working Paper Sign-Off';
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF' + WHITE } };
  ws.getCell('A1').fill = headerFill(NAVY);
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  const signRows = [
    ['Prepared By', skill.step1.responsibleAuditor?.name || '', 'Date: ____________'],
    ['Reviewed By', '', 'Date: ____________'],
    ['Approved By', '', 'Date: ____________'],
  ];
  signRows.forEach(([role, name, date]) => {
    const r = ws.addRow([role, name, date]);
    r.getCell(1).font = bold(NAVY);
    r.getCell(1).fill = bgFill(SMOKE);
    r.eachCell(c => { c.border = border; c.alignment = { vertical: 'middle' }; });
    r.height = 36;
  });

  ws.addRow([]);
  const discRow = ws.addRow(['This working paper was generated by AuditSkills Platform. It should be reviewed and signed by a qualified auditor before being placed on file.']);
  ws.mergeCells(`A${discRow.number}:C${discRow.number}`);
  discRow.getCell(1).font = normal('4A5568', 9);
  discRow.getCell(1).alignment = { wrapText: true };
  discRow.height = 36;
}

// ─── Main export function ────────────────────────────────────────────────────
async function generateExcel(run, skill, ingestionData, findings) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AuditSkills Platform';
  wb.created = new Date();
  wb.properties.date1904 = false;

  buildIndexSheet(wb, run, skill);
  buildPopulationSheet(wb, ingestionData);
  buildDataQualitySheet(wb, ingestionData.quality, ingestionData);

  for (const testResult of (run.testResults || [])) {
    buildTestSheet(wb, testResult, skill);
  }

  buildExceptionRegisterSheet(wb, findings);
  buildFindingSummarySheet(wb, findings, run);
  buildSignOffSheet(wb, skill, run);

  return wb.xlsx.writeBuffer();
}

module.exports = { generateExcel };
