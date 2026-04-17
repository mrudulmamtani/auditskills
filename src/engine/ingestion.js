/**
 * AuditSkills — Data Ingestion Engine
 * Parses uploaded Excel/CSV files, applies column mappings,
 * runs data quality checks, and builds the in-scope population.
 *
 * Field mapping objects may use either:
 *   { canonicalName, type, hint }       — original seeded format
 *   { logicalName, dataType, displayName } — builder-created format
 * All helpers normalise via fieldKey() / fieldType() below.
 */
const XLSX = require('xlsx');

/** Returns the canonical key for a field mapping object. */
function fieldKey(fm) {
  return (fm.canonicalName || fm.logicalName || '').trim();
}

/** Returns the data type string for a field mapping object. */
function fieldType(fm) {
  return (fm.type || fm.dataType || 'Text').trim();
}

/**
 * Parse an uploaded file buffer into rows using XLSX.
 * Supports .xlsx, .xls, .csv
 */
function parseFile(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  return { rows, sheetName, totalRows: rows.length };
}

/**
 * Auto-detect column mappings by fuzzy-matching canonical names
 * against actual column headers in the file.
 */
function detectColumnMappings(fileRows, fieldMappings) {
  if (!fileRows || fileRows.length === 0) return {};
  const headers = Object.keys(fileRows[0]);
  const mappings = {};

  for (const fm of fieldMappings) {
    const key = fieldKey(fm);
    if (!key) continue;

    const hint      = (fm.hint || fm.displayName || '').toLowerCase();
    const canonical = key.toLowerCase();

    // Try exact match on hint, then canonical, then fuzzy prefix
    let found = hint   ? headers.find(h => h.toLowerCase() === hint)         : null;
    if (!found) found  = headers.find(h => h.toLowerCase() === canonical);
    if (!found) found  = headers.find(h => h.toLowerCase().includes(canonical.split('_')[0]));
    if (!found && hint) found = headers.find(h => h.toLowerCase().includes(hint.split(' ')[0]));
    if (found) mappings[key] = found;
  }
  return mappings;
}

/**
 * Apply field mappings: rename columns, cast types, handle nulls.
 * Returns { mappedRows, warnings, rejects }
 */
function applyMappings(rawRows, fieldMappings, columnMappings, skill) {
  const materiality = skill.step1.materialityUsd || 10000;
  const mappedRows  = [];
  const warnings    = [];
  const rejects     = [];

  rawRows.forEach((raw, idx) => {
    const row = { _rowIndex: idx + 2 }; // 1-indexed + header row
    let reject = false;

    for (const fm of fieldMappings) {
      const key    = fieldKey(fm);
      const ftype  = fieldType(fm);
      if (!key) continue;

      const srcCol = columnMappings[key];
      let val      = srcCol ? raw[srcCol] : null;

      // Normalise empty strings
      if (val === '' || val === undefined) val = null;

      // Type casting
      if (val !== null) {
        if (ftype === 'Currency' || ftype === 'Number' || ftype === 'Integer') {
          const n = parseFloat(String(val).replace(/[,$€£\s]/g, ''));
          val = isNaN(n) ? null : n;
        } else if (ftype === 'Date') {
          const d = new Date(val);
          val = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        } else {
          val = String(val).trim() || null;
        }
      }

      // Null handling
      const isRequired = fm.required === true ||
        (fm.required === 'conditional' && row['invoice_amount'] > materiality);

      if (val === null) {
        const handling = fm.nullHandling || 'pass_through';
        if (isRequired && handling === 'reject_row') {
          rejects.push({ row: idx + 2, field: key, reason: 'Required field is null' });
          reject = true;
        } else if (handling === 'substitute_zero') {
          val = 0;
        } else if (handling === 'substitute_blank') {
          val = '';
        } else if (handling === 'flag_for_review') {
          warnings.push({ row: idx + 2, field: key, reason: 'Null value in required field' });
        }
        // flag_as_exception / pass_through — leave null, test engine catches it
      }

      row[key] = val;
    }

    if (!reject) mappedRows.push(row);
  });

  return { mappedRows, warnings, rejects };
}

/**
 * Apply scope exclusions from skill step 1.
 */
function applyExclusions(rows, exclusions) {
  const excluded = [];
  const inScope  = [];

  rows.forEach(row => {
    let isExcluded = false;
    if (exclusions.includes('intercompany_transactions')) {
      const vendorId   = String(row.vendor_id   || '').toLowerCase();
      const vendorName = String(row.vendor_name || '').toLowerCase();
      if (vendorId.startsWith('ic-') || vendorName.includes('interco') || vendorName.includes('intercompany')) {
        isExcluded = true;
        excluded.push({ ...row, _exclusionReason: 'intercompany_transactions' });
      }
    }
    if (!isExcluded) inScope.push(row);
  });

  return { inScope, excluded };
}

/**
 * Deduplication: remove rows with duplicate key values.
 */
function deduplicateRows(rows, dedupKeys) {
  const keys   = Array.isArray(dedupKeys) && dedupKeys.length ? dedupKeys : [];
  const seen   = new Map();
  const unique = [];
  const duplicates = [];

  rows.forEach(row => {
    if (!keys.length) { unique.push(row); return; }
    const key = keys.map(k => String(row[k] ?? '')).join('|');
    if (seen.has(key)) {
      duplicates.push({ ...row, _dupOf: seen.get(key) });
    } else {
      seen.set(key, row._rowIndex);
      unique.push(row);
    }
  });

  return { unique, duplicates };
}

/**
 * Data quality report.
 */
function qualityReport(mappedRows, fieldMappings, duplicates, rejects, qualityGate) {
  const total  = mappedRows.length + rejects.length;
  const report = {
    totalRows:    total,
    rejectedRows: rejects.length,
    duplicateRows:duplicates.length,
    inScopeRows:  mappedRows.length,
    nullRates: {},
    blocked: false,
    blockReasons: [],
    warnings: [],
  };

  const gate = qualityGate || { maxNullRateBlocking: 0.5, maxDupRateBlocking: 0.5, minRowCount: 1 };

  for (const fm of fieldMappings) {
    const key       = fieldKey(fm);
    if (!key) continue;
    const nullCount = mappedRows.filter(r => r[key] === null || r[key] === '').length;
    const rate      = total > 0 ? nullCount / total : 0;
    report.nullRates[key] = { nullCount, rate: +(rate * 100).toFixed(1) };
    if (rate > gate.maxNullRateBlocking) {
      report.blocked = true;
      report.blockReasons.push(`Field "${key}" null rate ${(rate * 100).toFixed(1)}% exceeds blocking threshold`);
    }
  }

  const dupRate = total > 0 ? duplicates.length / total : 0;
  if (dupRate > gate.maxDupRateBlocking) {
    report.blocked = true;
    report.blockReasons.push(`Duplicate rate ${(dupRate * 100).toFixed(1)}% exceeds blocking threshold`);
  }
  if (mappedRows.length < (gate.minRowCount || 1)) {
    report.blocked = true;
    report.blockReasons.push(`In-scope population (${mappedRows.length} rows) below minimum of ${gate.minRowCount}`);
  }

  return report;
}

/**
 * Main ingestion pipeline: parse → map → exclude → dedup → quality check.
 */
function ingest(buffer, filename, skill) {
  const { rows: rawRows, totalRows } = parseFile(buffer, filename);
  const fieldMappings = (skill.step2 && skill.step2.fieldMappings) || [];
  const dedupKeys     = (skill.step2 && skill.step2.dedupKeys)     || [];
  const qualityGate   = (skill.step2 && skill.step2.qualityGate)   || {};
  const columnMappings = detectColumnMappings(rawRows, fieldMappings);
  const { mappedRows, warnings, rejects } = applyMappings(rawRows, fieldMappings, columnMappings, skill);
  const { inScope, excluded }   = applyExclusions(mappedRows, (skill.step1 && skill.step1.exclusions) || []);
  const { unique, duplicates }  = deduplicateRows(inScope, dedupKeys);
  const quality = qualityReport(unique, fieldMappings, duplicates, rejects, qualityGate);

  return {
    columnMappings,
    population: unique,
    excluded,
    duplicates,
    rejects,
    warnings,
    quality,
    totalRows,
  };
}

module.exports = { ingest, detectColumnMappings };
