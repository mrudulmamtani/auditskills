/**
 * AuditSkills — PDF Findings Report Exporter
 * Generates a professional findings report PDF using PDFKit.
 */
const PDFDocument = require('pdfkit');

const NAVY  = '#1B3A6B';
const TEAL  = '#0D7C7C';
const GOLD  = '#C8922A';
const WHITE = '#FFFFFF';
const SMOKE = '#F4F6F9';
const MID   = '#4A5568';
const RED   = '#B91C1C';
const AMBER = '#D97706';
const GREEN = '#15803D';
const RED_LT   = '#FEE2E2';
const AMBER_LT = '#FEF3C7';
const GREEN_LT = '#DCFCE7';

const RISK_COLOR = { High: RED, Medium: AMBER, Low: GREEN };
const RISK_BG    = { High: RED_LT, Medium: AMBER_LT, Low: GREEN_LT };

function generatePDF(run, skill, findings) {
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, left: 50, right: 50, bottom: 50 }, autoFirstPage: false });
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── COVER PAGE ──────────────────────────────────────────────────────────
      doc.addPage();

      const W = doc.page.width - 100; // content width

      // Navy header bar
      doc.rect(0, 0, doc.page.width, 200).fill(NAVY);
      // Teal accent top strip
      doc.rect(0, 0, doc.page.width, 6).fill(TEAL);
      // Gold accent bottom strip
      doc.rect(0, 194, doc.page.width, 6).fill(GOLD);

      doc.fillColor(WHITE).fontSize(28).font('Helvetica-Bold')
        .text(skill.name, 50, 40, { width: doc.page.width - 100 });
      doc.fontSize(14).font('Helvetica')
        .text('Internal Audit Findings Report', 50, 80, { width: doc.page.width - 100 });
      doc.fontSize(11)
        .text(`Audit Period: ${skill.step1.auditPeriod?.label || ''}   |   Skill v${run.skillVersion}   |   CONFIDENTIAL`, 50, 110);
      doc.fontSize(10)
        .text(`Issued: ${new Date(run.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 130);
      doc.text(`Prepared by: ${skill.step1.responsibleAuditor?.name || 'Auditor'}`, 50, 148);

      // Stats row on cover
      doc.rect(0, 210, doc.page.width, 90).fill(SMOKE);
      const highCount   = findings.filter(f => f.risk === 'High').length;
      const medCount    = findings.filter(f => f.risk === 'Medium').length;
      const lowCount    = findings.filter(f => f.risk === 'Low').length;
      const totalExp    = findings.reduce((s, f) => s + (f.monetaryExposure || 0), 0);

      const statBoxes = [
        { label: 'Total Findings', val: String(findings.length),         color: NAVY  },
        { label: 'High Risk',      val: String(highCount),                color: RED   },
        { label: 'Medium Risk',    val: String(medCount),                 color: AMBER },
        { label: 'Low Risk',       val: String(lowCount),                 color: GREEN },
        { label: 'Total Exposure', val: `$${totalExp.toLocaleString()}`,  color: NAVY  },
      ];
      statBoxes.forEach(({ label, val, color }, i) => {
        const sx = 50 + i * 100;
        doc.fontSize(22).font('Helvetica-Bold').fillColor(color).text(val, sx, 222, { width: 90, align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor(MID).text(label, sx, 254, { width: 90, align: 'center' });
      });

      // ── EXECUTIVE SUMMARY ───────────────────────────────────────────────────
      doc.moveDown(6);
      sectionHeader(doc, 'Executive Summary');

      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      doc.text(`This report presents the findings of the audit of "${skill.name}" for the period ${skill.step1.auditPeriod?.label || ''}. The audit was conducted in accordance with the organisation\'s internal audit methodology.`, { align: 'justify' });
      doc.moveDown(0.5);

      const highFindings = findings.filter(f => f.risk === 'High');
      const medFindings  = findings.filter(f => f.risk === 'Medium');

      if (highFindings.length > 0) {
        doc.font('Helvetica-Bold').fillColor(RED).text(`${highFindings.length} HIGH risk finding${highFindings.length > 1 ? 's were' : ' was'} identified`, { continued: false });
        doc.font('Helvetica').fillColor('#333333').text(`totalling $${highFindings.reduce((s, f) => s + (f.monetaryExposure || 0), 0).toLocaleString()} in monetary exposure. Immediate management action is required.`);
        doc.moveDown(0.3);
      }
      if (medFindings.length > 0) {
        doc.font('Helvetica-Bold').fillColor(AMBER).text(`${medFindings.length} MEDIUM risk finding${medFindings.length > 1 ? 's were' : ' was'} identified`, { continued: false });
        doc.font('Helvetica').fillColor('#333333').text(`totalling $${medFindings.reduce((s, f) => s + (f.monetaryExposure || 0), 0).toLocaleString()} in monetary exposure. Management should address within 60 days.`);
        doc.moveDown(0.3);
      }
      if (findings.length === 0) {
        doc.font('Helvetica').fillColor(GREEN).text('No exceptions were identified. All audit tests passed within acceptable thresholds.');
      }

      // ── SCOPE & METHODOLOGY ─────────────────────────────────────────────────
      doc.moveDown(0.5);
      sectionHeader(doc, 'Scope & Methodology');

      labelValue(doc, 'Audit Objective', skill.step1.auditObjective);
      labelValue(doc, 'Population', skill.step1.population);
      labelValue(doc, 'Exclusions', (skill.step1.exclusions || []).join(', '));
      labelValue(doc, 'Assertions Tested', (skill.step1.assertions || []).join(', '));
      labelValue(doc, 'Materiality Threshold', `$${(skill.step1.materialityUsd || 0).toLocaleString()}`);
      labelValue(doc, 'Population Size', `${run.inScopeRows} in-scope records (${run.excludedRows} excluded)`);

      // ── HIGH RISK FINDINGS ──────────────────────────────────────────────────
      if (highFindings.length > 0) {
        addPage(doc);
        sectionHeader(doc, 'High Risk Findings', RED);
        highFindings.forEach(f => findingBlock(doc, f, W));
      }

      // ── MEDIUM RISK FINDINGS ────────────────────────────────────────────────
      if (medFindings.length > 0) {
        doc.moveDown(1);
        if (doc.y > doc.page.height - 200) addPage(doc);
        sectionHeader(doc, 'Medium Risk Findings', AMBER);
        medFindings.forEach(f => findingBlock(doc, f, W));
      }

      // ── LOW RISK / OBSERVATIONS ─────────────────────────────────────────────
      const lowFindings = findings.filter(f => f.risk === 'Low');
      if (lowFindings.length > 0) {
        doc.moveDown(0.5);
        if (doc.y > doc.page.height - 150) addPage(doc);
        sectionHeader(doc, 'Low Risk Observations', GREEN);
        lowFindings.forEach(f => {
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333').text(`• ${f.testName}: `, { continued: true });
          doc.font('Helvetica').text(f.condition);
        });
      }

      // ── APPENDIX: TEST RESULTS ──────────────────────────────────────────────
      addPage(doc);
      sectionHeader(doc, 'Appendix A — Test Results Summary');

      const testCols = [50, 200, 310, 380, 440];
      const hTexts   = ['Test ID', 'Test Name', 'Exceptions', 'Exc. Rate', 'Result'];
      hTexts.forEach((h, i) => {
        doc.rect(testCols[i], doc.y, (testCols[i + 1] || 545) - testCols[i], 20).fill(NAVY);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(WHITE).text(h, testCols[i] + 3, doc.y - 17, { width: 110 });
      });
      doc.moveDown(0.5);

      (run.testResults || []).forEach((t, i) => {
        const y = doc.y;
        const rowBg = i % 2 === 0 ? SMOKE : WHITE;
        doc.rect(50, y, 495, 18).fill(rowBg);
        const cells = [t.testId, t.testName, t.excCount, t.excRate + '%', t.passed ? 'PASS ✓' : 'FAIL ✗'];
        cells.forEach((c, ci) => {
          doc.font(ci === 4 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
            .fillColor(ci === 4 ? (t.passed ? GREEN : RED) : '#333333')
            .text(String(c), testCols[ci] + 3, y + 4, { width: (testCols[ci + 1] || 545) - testCols[ci] - 6 });
        });
        doc.moveDown(0.3);
      });

      // ── FOOTER ─────────────────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.rect(0, doc.page.height - 36, doc.page.width, 36).fill(NAVY);
        doc.rect(0, doc.page.height - 36, doc.page.width, 3).fill(GOLD);
        doc.font('Helvetica').fontSize(8).fillColor(WHITE)
          .text(`AuditSkills Platform — CONFIDENTIAL — ${skill.name}`, 50, doc.page.height - 22, { width: 350 });
        doc.fillColor(WHITE).text(`Page ${i - range.start + 1} of ${range.count}`, 450, doc.page.height - 22, { width: 100, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function sectionHeader(doc, title, color) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(color || NAVY).text(title);
  doc.rect(doc.x, doc.y, 495, 2).fill(color || TEAL);
  doc.moveDown(0.5);
}

function labelValue(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(label + ': ', { continued: true });
  doc.font('Helvetica').fillColor('#333333').text(value || '—');
  doc.moveDown(0.2);
}

function findingBlock(doc, finding, W) {
  if (doc.y > doc.page.height - 220) addPage(doc);
  doc.moveDown(0.3);

  const y = doc.y;
  const riskColor = RISK_COLOR[finding.risk] || NAVY;
  const riskBg    = RISK_BG[finding.risk]    || SMOKE;

  // Finding header bar
  doc.rect(50, y, W, 22).fill(riskColor);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE)
    .text(`${finding.id} — ${finding.testName}`, 58, y + 5, { width: W - 120 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(WHITE)
    .text(`[${finding.risk.toUpperCase()}]`, 50 + W - 65, y + 6, { width: 60, align: 'right' });
  doc.moveDown(0.3);

  // Finding body
  const bodyY = doc.y;
  doc.rect(50, bodyY, W, 150).fill(riskBg).stroke(riskColor);
  doc.moveDown(0.1);

  const labelW = 90;
  const valX   = 50 + labelW + 6;
  const valW   = W - labelW - 12;
  let rowY = bodyY + 8;

  const rows = [
    ['Condition', finding.condition],
    ['Category', finding.category],
    ['Exposure', finding.monetaryExposure ? `$${finding.monetaryExposure.toLocaleString()}` : '—'],
    ['Exceptions', `${finding.exceptionCount} items identified`],
    ['Recommendation', finding.recommendation],
    ['Mgmt. Response', finding.managementResponse || '(Awaiting management response)'],
  ];

  rows.forEach(([k, v]) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(k + ':', 58, rowY, { width: labelW });
    doc.font('Helvetica').fontSize(9).fillColor('#333333').text(v || '—', valX, rowY, { width: valW });
    rowY += doc.heightOfString(v || '—', { width: valW, fontSize: 9 }) + 8;
  });

  doc.y = bodyY + 155;
  doc.moveDown(0.6);
}

function addPage(doc) {
  doc.addPage();
  // Teal accent on content pages
  doc.rect(0, 0, doc.page.width, 4).fill(TEAL);
}

module.exports = { generatePDF };
