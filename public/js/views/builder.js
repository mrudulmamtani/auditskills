/**
 * Skill Builder — 4-step wizard
 * Step 1: Objective  Step 2: Data Map  Step 3: Tests (auto-generated)  Step 4: Classification (auto-generated)
 */
const BuilderView = {
  _skill: null,
  _step: 1,
  _step3Generated: false,
  _step4Generated: false,

  async render(params) {
    document.getElementById('topbar-title').textContent = 'Skill Builder';
    const el = document.getElementById('view-container');
    el.innerHTML = `<div class="loading-wrap"><div class="spinner"></div></div>`;

    try {
      if (params && params.id) {
        this._skill = await API.skills.get(params.id);
        this._step3Generated = (this._skill.step3?.tests?.length > 0);
        this._step4Generated = (this._skill.step4?.classificationRules?.length > 0);
      } else {
        this._skill = {
          name: '', shortDescription: '',
          step1: { auditObjective:'', scope:'', assertions:[], materialityUsd:10000, inherentRisk:'High', controlEnvironment:'Moderate' },
          step2: { fieldMappings:[], dedupKeys:['invoice_id'], qualityGate:{ maxNullRateBlocking:0.10, maxDupRateBlocking:0.05, minRowCount:5 } },
          step3: { tests:[] },
          step4: { classificationRules:[], followUpPolicy:{}, recommendedActions:{} },
          meta: { category:'', tags:[] },
        };
        this._step3Generated = false;
        this._step4Generated = false;
      }
      this._step = 1;
      this._renderWizard(el);
    } catch(e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${escHtml(e.message)}</p></div>`;
    }
  },

  _renderWizard(el) {
    el.innerHTML = `
      <div class="wizard-wrap">
        <div class="wizard-steps" id="wizard-steps">
          ${[
            ['Objective','Define the audit goal'],
            ['Data Map','Map your data fields'],
            ['Test Procedures','Auto-generated tests'],
            ['Classification','Auto-generated rules'],
          ].map(([label, sub], i) => {
            const n = i + 1;
            const isDone   = this._step > n;
            const isActive = this._step === n;
            return `
              <div class="wizard-step ${isActive?'active':isDone?'done':''}" data-step="${n}" onclick="BuilderView._goStep(${n})">
                <div class="step-num">${isDone ? '✓' : n}</div>
                <div>
                  <div class="step-label">${label}</div>
                  <div style="font-size:10px;color:${isActive?'rgba(255,255,255,.6)':'var(--muted)'}">${sub}</div>
                </div>
              </div>`;
          }).join('')}
        </div>

        <div id="step1-panel" class="step-panel ${this._step===1?'active':''}">
          ${this._renderStep1()}
        </div>
        <div id="step2-panel" class="step-panel ${this._step===2?'active':''}">
          ${this._renderStep2()}
        </div>
        <div id="step3-panel" class="step-panel ${this._step===3?'active':''}">
          ${this._renderStep3()}
        </div>
        <div id="step4-panel" class="step-panel ${this._step===4?'active':''}">
          ${this._renderStep4()}
        </div>

        <div class="flex" style="justify-content:space-between;margin-top:20px">
          <button class="btn btn-ghost" ${this._step===1?'disabled':''} onclick="BuilderView._goStep(${this._step-1})">← Back</button>
          <div class="flex gap-8">
            <button class="btn btn-ghost" onclick="BuilderView._save(false)">💾 Save Draft</button>
            ${this._step < 4
              ? `<button class="btn btn-primary" onclick="BuilderView._goStep(${this._step+1})">Next →</button>`
              : `<button class="btn btn-teal" onclick="BuilderView._save(true)">✓ Save &amp; Finish</button>`}
          </div>
        </div>
      </div>
    `;
  },

  // ── Step 1: Objective ──────────────────────────────────────────────────────
  _renderStep1() {
    const s = this._skill.step1 || {};
    const assertions = ['Completeness','Accuracy','Existence','Valuation','Cut-off','Rights & Obligations'];
    const sel = s.assertions || [];
    return `
      <div class="card">
        <div class="card-title">Audit Objective &amp; Scope</div>
        <div class="card-sub" style="margin-bottom:20px">Define what this skill is designed to audit. The objective and assertions you choose here will drive <strong>auto-generation</strong> of test procedures in Step 3.</div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Skill Name <span class="req">*</span></label>
            <input class="form-input" id="f-name" value="${escHtml(this._skill.name)}" placeholder="e.g. Vendor Invoice Completeness"/>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="f-category">
              ${['','Procure-to-Pay','Revenue','Payroll','IT General Controls','Compliance','Treasury','Fixed Assets','Inventory'].map(c =>
                `<option value="${c}" ${(this._skill.meta?.category||'')=== c?'selected':''}>${c||'Select category…'}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Short Description</label>
          <input class="form-input" id="f-desc" value="${escHtml(this._skill.shortDescription||'')}" placeholder="One-line description for the registry"/>
        </div>
        <div class="form-group">
          <label class="form-label">Audit Objective <span class="req">*</span></label>
          <textarea class="form-textarea" id="f-objective" rows="3" placeholder="What is this skill designed to detect or verify? Be specific — this drives test auto-generation.">${escHtml(s.auditObjective||'')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Audit Scope</label>
            <input class="form-input" id="f-scope" value="${escHtml(s.scope||'')}" placeholder="e.g. FY2025 AP transactions"/>
          </div>
          <div class="form-group">
            <label class="form-label">Audit Period</label>
            <input class="form-input" id="f-period" value="${escHtml(s.auditPeriod?.label||'')}" placeholder="e.g. Jan–Dec 2025"/>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Materiality Threshold (USD)</label>
            <input class="form-input" type="number" id="f-materiality" value="${s.materialityUsd||10000}" min="0"/>
          </div>
          <div class="form-group">
            <label class="form-label">Inherent Risk</label>
            <select class="form-select" id="f-inherent-risk">
              ${['Low','Moderate','High','Critical'].map(r =>
                `<option value="${r}" ${s.inherentRisk===r?'selected':''}>${r}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Financial Assertions <span class="fs-11 color-muted">(select all that apply — used to auto-generate relevant tests)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">
            ${assertions.map(a => `
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:6px 12px;background:var(--bg);border:1.5px solid ${sel.includes(a)?'var(--teal)':'var(--border)'};border-radius:6px;transition:all .15s" onclick="this.style.borderColor=this.querySelector('input').checked?'var(--border)':'var(--teal)'">
                <input type="checkbox" class="f-assertion" value="${a}" ${sel.includes(a)?'checked':''}/>
                ${a}
              </label>`).join('')}
          </div>
        </div>
      </div>`;
  },

  // ── Step 2: Data Map ───────────────────────────────────────────────────────
  _renderStep2() {
    const s = this._skill.step2 || {};
    const fields = (s.fieldMappings && s.fieldMappings.length) ? s.fieldMappings : [
      { logicalName:'invoice_id',     displayName:'Invoice ID',     dataType:'Text',     required:true,  nullHandling:'reject_row' },
      { logicalName:'invoice_date',   displayName:'Invoice Date',   dataType:'Date',     required:true,  nullHandling:'reject_row' },
      { logicalName:'invoice_amount', displayName:'Invoice Amount', dataType:'Currency', required:true,  nullHandling:'reject_row' },
      { logicalName:'vendor_id',      displayName:'Vendor ID',      dataType:'Text',     required:false, nullHandling:'flag_as_exception' },
      { logicalName:'po_number',      displayName:'PO Number',      dataType:'Text',     required:false, nullHandling:'flag_as_exception' },
      { logicalName:'approver_id',    displayName:'Approver ID',    dataType:'Text',     required:false, nullHandling:'flag_as_exception' },
      { logicalName:'po_amount',      displayName:'PO Amount',      dataType:'Currency', required:false, nullHandling:'substitute_zero' },
    ];
    if (!s.fieldMappings || !s.fieldMappings.length) this._skill.step2.fieldMappings = fields;
    const qg = s.qualityGate || { maxNullRateBlocking:0.10, maxDupRateBlocking:0.05, minRowCount:5 };
    return `
      <div class="card">
        <div class="card-title">Data Field Mapping</div>
        <div class="card-sub" style="margin-bottom:20px">Map your data columns to logical fields. The fields you define here are used to <strong>auto-generate test procedures</strong> in Step 3.</div>

        <div class="table-wrap mb-16" style="max-height:360px;overflow-y:auto">
          <table>
            <thead><tr>
              <th>Logical Name</th><th>Display Name</th><th>Data Type</th><th>Required</th><th>Null Handling</th><th style="width:40px"></th>
            </tr></thead>
            <tbody id="field-tbody">
              ${fields.map((f, i) => this._fieldRow(f, i)).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn btn-ghost btn-sm mb-16" onclick="BuilderView._addField()">+ Add Field</button>

        <div class="divider"></div>
        <div class="card-title" style="margin-top:4px;margin-bottom:16px">Quality Gate</div>
        <div class="form-row3">
          <div class="form-group">
            <label class="form-label">Max Null Rate (blocking)</label>
            <input class="form-input" type="number" id="f-qg-null" value="${qg.maxNullRateBlocking||0.10}" min="0" max="1" step="0.01"/>
            <div class="form-hint">e.g. 0.10 = 10%</div>
          </div>
          <div class="form-group">
            <label class="form-label">Max Dup Rate (blocking)</label>
            <input class="form-input" type="number" id="f-qg-dup" value="${qg.maxDupRateBlocking||0.05}" min="0" max="1" step="0.01"/>
          </div>
          <div class="form-group">
            <label class="form-label">Min Row Count</label>
            <input class="form-input" type="number" id="f-qg-rows" value="${qg.minRowCount||5}" min="1"/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dedup Keys <span class="fs-11 color-muted">(comma-separated logical field names)</span></label>
          <input class="form-input" id="f-dedup" value="${(s.dedupKeys||['invoice_id']).join(', ')}" placeholder="invoice_id"/>
        </div>
      </div>`;
  },

  _fieldRow(f, i) {
    const types    = ['Text','Currency','Date','Integer','Boolean'];
    const nullOpts = ['reject_row','flag_as_exception','substitute_zero','pass_through'];
    return `
      <tr data-field-idx="${i}" id="field-row-${i}">
        <td><input class="form-input" style="padding:5px 8px;font-size:12px" value="${escHtml(f.logicalName||'')}" placeholder="logical_name" onchange="BuilderView._fieldChanged(${i},'logicalName',this.value)"/></td>
        <td><input class="form-input" style="padding:5px 8px;font-size:12px" value="${escHtml(f.displayName||'')}" placeholder="Display Name" onchange="BuilderView._fieldChanged(${i},'displayName',this.value)"/></td>
        <td>
          <select class="form-select" style="padding:5px 8px;font-size:12px" onchange="BuilderView._fieldChanged(${i},'dataType',this.value)">
            ${types.map(t => `<option ${f.dataType===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </td>
        <td style="text-align:center">
          <input type="checkbox" ${f.required?'checked':''} onchange="BuilderView._fieldChanged(${i},'required',this.checked)"/>
        </td>
        <td>
          <select class="form-select" style="padding:5px 8px;font-size:12px" onchange="BuilderView._fieldChanged(${i},'nullHandling',this.value)">
            ${nullOpts.map(o => `<option ${f.nullHandling===o?'selected':''}>${o}</option>`).join('')}
          </select>
        </td>
        <td>
          <button class="btn btn-icon btn-sm" title="Remove field" onclick="BuilderView._removeField(${i})" style="color:var(--red);border-color:transparent;background:none;font-size:16px;padding:2px 6px">×</button>
        </td>
      </tr>`;
  },

  // ── Step 3: Tests (auto-generated) ────────────────────────────────────────
  _renderStep3() {
    const tests = this._skill.step3?.tests || [];
    const hasTests = tests.length > 0;
    return `
      <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px">
          <div>
            <div class="card-title">Test Procedures</div>
            <div class="card-sub">Auto-generated from your objective and data fields. Review, edit, or add tests before signing off.</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="BuilderView._autoGenerateTests(true)" style="flex-shrink:0">
            ✨ Re-generate
          </button>
        </div>

        ${!hasTests ? `
          <div class="empty-state" style="padding:32px;background:var(--bg);border-radius:8px;border:2px dashed var(--border)">
            <div class="empty-state-icon">✨</div>
            <h3>Generate Test Procedures</h3>
            <p style="margin-bottom:16px">Click below to auto-generate tests based on your objective and data fields.</p>
            <button class="btn btn-primary" onclick="BuilderView._autoGenerateTests(false)">Generate Tests Now</button>
          </div>` : `
          <div id="gen-banner" style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#E6F7F8;border-radius:8px;margin-bottom:16px;font-size:12px;color:var(--teal)">
            <span>✨</span>
            <span><strong>${tests.length} test${tests.length!==1?'s':''} generated</strong> based on your objective, assertions and data fields. Review and edit below, then click <strong>Next →</strong> to sign off.</span>
          </div>`}

        <div class="test-list" id="test-list">
          ${tests.map((t, i) => this._testCard(t, i)).join('')}
        </div>

        ${hasTests ? `
          <div class="flex gap-8 mt-16">
            <button class="btn btn-ghost btn-sm" onclick="BuilderView._addTest('population_100pct')">+ Population Test</button>
            <button class="btn btn-ghost btn-sm" onclick="BuilderView._addTest('analytical')">+ Analytical Test</button>
            <button class="btn btn-ghost btn-sm" onclick="BuilderView._addTest('sampling')">+ Sampling Test</button>
          </div>` : ''}
      </div>`;
  },

  _testCard(t, i) {
    const criteriaJson = JSON.stringify(t.criteria || {}, null, 2);
    return `
      <div class="test-card" id="test-card-${i}" style="border-left:4px solid ${t.type==='population_100pct'?'var(--teal)':t.type==='analytical'?'var(--navy2)':'var(--amber)'}">
        <div class="test-card-header">
          <div class="flex-center gap-8">
            <span class="test-type-badge test-type-${t.type}">${t.type}</span>
            <span class="test-card-title">${escHtml(t.id||'')}${t.id?': ':''}${escHtml(t.name||'Unnamed Test')}</span>
            ${t._autoGenerated ? '<span style="font-size:10px;color:var(--teal);font-weight:600">✨ auto-generated</span>' : ''}
          </div>
          <button class="btn btn-icon btn-sm" title="Remove test" onclick="BuilderView._removeTest(${i})" style="color:var(--red);border-color:transparent;background:none;font-size:18px;padding:2px 6px">×</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Test ID</label>
            <input class="form-input" value="${escHtml(t.id||'')}" onchange="BuilderView._testChanged(${i},'id',this.value)"/>
          </div>
          <div class="form-group">
            <label class="form-label">Test Name</label>
            <input class="form-input" value="${escHtml(t.name||'')}" onchange="BuilderView._testChanged(${i},'name',this.value)"/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Objective</label>
          <input class="form-input" value="${escHtml(t.objective||'')}" onchange="BuilderView._testChanged(${i},'objective',this.value)"/>
        </div>
        <div class="form-group">
          <label class="form-label">Criteria (JSON) <span class="fs-11 color-muted">— defines the test logic</span></label>
          <textarea class="form-textarea" style="font-family:monospace;font-size:11px" rows="4" onchange="BuilderView._testChangedJson(${i},'criteria',this.value)">${escHtml(criteriaJson)}</textarea>
        </div>
      </div>`;
  },

  // ── Step 4: Classification (auto-generated) ────────────────────────────────
  _renderStep4() {
    const s = this._skill.step4 || {};
    const rules = s.classificationRules || [];
    const fp    = s.followUpPolicy || {};
    const ra    = s.recommendedActions || {};
    const hasRules = rules.length > 0;
    return `
      <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px">
          <div>
            <div class="card-title">Finding Classification</div>
            <div class="card-sub">Auto-generated from your test procedures. Review risk levels and follow-up actions before finishing.</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="BuilderView._autoGenerateClassification(true)" style="flex-shrink:0">
            ✨ Re-generate
          </button>
        </div>

        ${!hasRules ? `
          <div class="empty-state" style="padding:32px;background:var(--bg);border-radius:8px;border:2px dashed var(--border)">
            <div class="empty-state-icon">✨</div>
            <h3>Generate Classification Rules</h3>
            <p style="margin-bottom:16px">Auto-generate risk classification for each test based on your inherent risk and materiality settings.</p>
            <button class="btn btn-primary" onclick="BuilderView._autoGenerateClassification(false)">Generate Classifications</button>
          </div>` : `
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:#E6F7F8;border-radius:8px;margin-bottom:16px;font-size:12px;color:var(--teal)">
            <span>✨</span>
            <span><strong>${rules.length} classification rule${rules.length!==1?'s':''} generated</strong>. Review risk levels and actions, then click <strong>Save &amp; Finish</strong> to create your skill.</span>
          </div>`}

        <div id="rules-list">
          ${rules.map((r, i) => this._ruleRow(r, i)).join('')}
        </div>
        ${hasRules ? `<button class="btn btn-ghost btn-sm mt-16" onclick="BuilderView._addRule()">+ Add Rule</button>` : ''}

        ${hasRules ? `
          <div class="divider"></div>
          <div class="section-title" style="font-size:13px;margin-bottom:16px;margin-top:4px">Follow-Up Policy</div>
          <div class="form-row3">
            <div class="form-group">
              <label class="form-label">High Risk — due in (days)</label>
              <input class="form-input" type="number" id="f-fp-high" value="${fp.high?.responseDueDays||15}" min="1"/>
            </div>
            <div class="form-group">
              <label class="form-label">Medium Risk — due in (days)</label>
              <input class="form-input" type="number" id="f-fp-med" value="${fp.medium?.responseDueDays||30}" min="1"/>
            </div>
            <div class="form-group">
              <label class="form-label">Low Risk — due in (days)</label>
              <input class="form-input" type="number" id="f-fp-low" value="${fp.low?.responseDueDays||60}" min="1"/>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">High Risk — Recommended Action</label>
            <textarea class="form-textarea" id="f-ra-high" rows="2">${escHtml(ra.High||'Immediate escalation to CFO and Audit Committee; initiate root-cause investigation within 5 business days.')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Medium Risk — Recommended Action</label>
            <textarea class="form-textarea" id="f-ra-med" rows="2">${escHtml(ra.Medium||'Management to provide written response within 30 days; internal audit to validate remediation in next cycle.')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Low Risk — Recommended Action</label>
            <textarea class="form-textarea" id="f-ra-low" rows="2">${escHtml(ra.Low||'Process owner to acknowledge and document corrective action by next audit cycle.')}</textarea>
          </div>` : ''}
      </div>`;
  },

  _ruleRow(r, i) {
    const riskColors = { High:'var(--red)', Medium:'var(--amber)', Low:'var(--green)' };
    return `
      <div class="test-card" style="margin-bottom:10px;border-left:4px solid ${riskColors[r.riskLevel]||'var(--border)'}" id="rule-card-${i}">
        <div class="flex-center gap-8" style="justify-content:space-between;margin-bottom:12px">
          <div class="flex-center gap-8">
            <span class="badge badge-${(r.riskLevel||'medium').toLowerCase()}">${r.riskLevel||'Medium'}</span>
            <strong style="font-size:13px">${escHtml(r.findingTitle||'Classification Rule '+(i+1))}</strong>
            ${r._autoGenerated ? '<span style="font-size:10px;color:var(--teal);font-weight:600">✨ auto-generated</span>' : ''}
          </div>
          <button class="btn btn-icon btn-sm" title="Remove rule" onclick="BuilderView._removeRule(${i})" style="color:var(--red);border-color:transparent;background:none;font-size:18px;padding:2px 6px">×</button>
        </div>
        <div class="form-row3">
          <div class="form-group">
            <label class="form-label">Test ID</label>
            <input class="form-input" value="${escHtml(r.testId||'')}" onchange="BuilderView._ruleChanged(${i},'testId',this.value)" placeholder="T01"/>
          </div>
          <div class="form-group">
            <label class="form-label">Default Risk</label>
            <select class="form-select" onchange="BuilderView._ruleChanged(${i},'riskLevel',this.value);document.getElementById('rule-card-${i}').style.borderLeftColor=${JSON.stringify('{High:\'var(--red)\',Medium:\'var(--amber)\',Low:\'var(--green)\'}[this.value]||\'var(--border)\'')}"
              onchange="BuilderView._ruleChanged(${i},'riskLevel',this.value)">
              ${['High','Medium','Low'].map(v => `<option ${r.riskLevel===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" onchange="BuilderView._ruleChanged(${i},'category',this.value)">
              ${['Control Deficiency','Process Gap','Fraud Indicator','Compliance Issue','Data Quality'].map(c =>
                `<option ${r.category===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Finding Title</label>
          <input class="form-input" value="${escHtml(r.findingTitle||'')}" onchange="BuilderView._ruleChanged(${i},'findingTitle',this.value)" placeholder="e.g. Invoices Without PO Above Materiality"/>
        </div>
        <div class="form-group">
          <label class="form-label">Escalation <span class="fs-11 color-muted">(optional — auto-escalate to High if amount &gt; threshold)</span></label>
          <div class="flex-center gap-8">
            <input class="form-input" type="number" style="width:160px" placeholder="Amount threshold ($)" value="${r.escalation?.[0]?.ifAmountGt||''}"
              onchange="BuilderView._ruleEscalation(${i},this.value)"/>
            <span class="fs-12 color-muted">→ escalates to High Risk</span>
          </div>
        </div>
      </div>`;
  },

  // ── Auto-generation engine — Gemini AI with rule-based fallback ────────────

  async _autoGenerateTests(forceRegen) {
    this._collectCurrentStep();
    if (!forceRegen && this._skill.step3?.tests?.length > 0) {
      this._renderWizard(document.getElementById('view-container'));
      return;
    }

    // Show generating state
    const panel = document.getElementById('step3-panel');
    if (panel) panel.innerHTML = `
      <div class="card">
        <div class="loading-wrap" style="padding:48px;flex-direction:column;gap:12px">
          <div class="spinner"></div>
          <div style="font-size:13px;color:var(--muted)">✨ Generating test procedures with Gemini AI…</div>
        </div>
      </div>`;

    try {
      const res = await fetch('/api/generate/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: this._skill }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const { tests, source } = await res.json();
      this._skill.step3 = { tests };
      this._step3Generated = true;
      if (panel) panel.innerHTML = this._renderStep3();
      showToast(`✨ ${tests.length} tests generated by Gemini AI`, 'success');
    } catch (err) {
      console.warn('Gemini generation failed, using rule-based fallback:', err.message);
      this._autoGenerateTestsRuleBased();
    }
  },

  _autoGenerateTestsRuleBased() {
    const step1 = this._skill.step1 || {};
    const step2 = this._skill.step2 || {};
    const fields = (step2.fieldMappings || []).map(f => f.logicalName || f.canonicalName).filter(Boolean);
    const assertions  = step1.assertions || [];
    const inherentRisk = step1.inherentRisk || 'High';
    const materiality  = step1.materialityUsd || 10000;
    const category     = this._skill.meta?.category || '';
    const objective    = (step1.auditObjective || '').toLowerCase();

    const tests = [];
    let seq = 1;
    const nextId = () => `T${String(seq++).padStart(2,'0')}`;

    const controlFields = fields.filter(f => ['po_number','approver_id','approver','purchase_order','po_ref'].some(k => f.includes(k)));
    if (assertions.includes('Completeness') || objective.includes('complet') || controlFields.length) {
      const controlField = controlFields[0] || 'po_number';
      const amountField  = fields.find(f => f.includes('amount') || f.includes('value')) || 'invoice_amount';
      tests.push({ id: nextId(), name: `Missing ${this._toTitle(controlField)} Check`, type: 'population_100pct',
        objective: `Identify all transactions where ${controlField} is missing when ${amountField} exceeds $${materiality.toLocaleString()}.`,
        criteria: { op:'null_when', field: controlField, condition:{ field: amountField, op:'gt', value: materiality } }, _autoGenerated: true });
    }

    const hasPoAmount  = fields.some(f => f.includes('po_amount') || f.includes('po_value'));
    const hasInvAmount = fields.some(f => f.includes('invoice_amount') || f.includes('amount'));
    if ((assertions.includes('Accuracy') || assertions.includes('Valuation') || objective.includes('match')) && hasPoAmount && hasInvAmount) {
      const invAmt = fields.find(f => f.includes('invoice_amount') || f.includes('amount')) || 'invoice_amount';
      const poAmt  = fields.find(f => f.includes('po_amount')) || 'po_amount';
      tests.push({ id: nextId(), name: 'Three-Way Match Variance', type: 'population_100pct',
        objective: 'Verify invoice amounts reconcile to approved PO amounts within a 5% tolerance.',
        criteria: { type:'three_way_match', invoiceAmountField: invAmt, poAmountField: poAmt, tolerancePct: 0.05 }, _autoGenerated: true });
    }

    const hasDate   = fields.some(f => f.includes('date'));
    const hasVendor = fields.some(f => f.includes('vendor') || f.includes('supplier'));
    if ((assertions.includes('Accuracy') || category.includes('Procure') || objective.includes('duplicate') || objective.includes('split')) && hasDate && hasVendor) {
      const dateField   = fields.find(f => f.includes('date'))   || 'invoice_date';
      const amountField = fields.find(f => f.includes('amount')) || 'invoice_amount';
      const vendorField = fields.find(f => f.includes('vendor')) || 'vendor_id';
      tests.push({ id: nextId(), name: 'Split Payment Detection', type: 'analytical',
        objective: `Detect vendors with multiple invoices within ${3} days whose combined total exceeds $${materiality.toLocaleString()}.`,
        criteria: { type:'split_payment', vendorField, amountField, dateField, amountThreshold: materiality, windowDays: 3 }, _autoGenerated: true });
      tests.push({ id: nextId(), name: 'Exact Duplicate Invoice', type: 'analytical',
        objective: 'Identify invoices with identical vendor, amount, and date — potential duplicate payments.',
        criteria: { type:'exact_duplicate', keyFields:[vendorField, amountField, dateField] }, _autoGenerated: true });
    }

    if (assertions.includes('Existence') || inherentRisk === 'High' || inherentRisk === 'Critical') {
      const amountField = fields.find(f => f.includes('amount')) || 'invoice_amount';
      const sampleSize  = inherentRisk === 'Critical' ? 40 : inherentRisk === 'High' ? 25 : 15;
      tests.push({ id: nextId(), name: 'High-Value Sample Review', type: 'sampling',
        objective: 'Select a risk-based sample of highest-value transactions for substantive documentation testing.',
        criteria: { sampleSize, selection:'top_risk', selectionField: amountField }, _autoGenerated: true });
    }

    if (assertions.includes('Cut-off') && hasDate) {
      const dateField = fields.find(f => f.includes('date')) || 'invoice_date';
      tests.push({ id: nextId(), name: 'Period Cut-Off Check', type: 'population_100pct',
        objective: 'Identify transactions with null or out-of-period dates indicating cut-off errors.',
        criteria: { op:'out_of_period', dateField }, _autoGenerated: true });
    }

    if (tests.length === 0) {
      const amountField = fields.find(f => f.includes('amount')) || fields[0] || 'amount';
      tests.push({ id: nextId(), name: 'Population 100% Review', type: 'population_100pct',
        objective: `Flag all records above materiality threshold of $${materiality.toLocaleString()}.`,
        criteria: { op:'gt', field: amountField, value: materiality }, _autoGenerated: true });
    }

    this._skill.step3 = { tests };
    this._step3Generated = true;
    const panel = document.getElementById('step3-panel');
    if (panel) panel.innerHTML = this._renderStep3();
    else this._renderWizard(document.getElementById('view-container'));
    showToast(`✨ ${tests.length} tests generated (rule-based)`, 'success');
  },

  async _autoGenerateClassification(forceRegen) {
    this._collectCurrentStep();
    const tests = this._skill.step3?.tests || [];

    if (!forceRegen && this._skill.step4?.classificationRules?.length > 0) {
      this._renderWizard(document.getElementById('view-container'));
      return;
    }
    if (tests.length === 0) {
      showToast('Generate test procedures first (Step 3)', 'error');
      return;
    }

    const panel = document.getElementById('step4-panel');
    if (panel) panel.innerHTML = `
      <div class="card">
        <div class="loading-wrap" style="padding:48px;flex-direction:column;gap:12px">
          <div class="spinner"></div>
          <div style="font-size:13px;color:var(--muted)">✨ Generating classification rules with Gemini AI…</div>
        </div>
      </div>`;

    try {
      const res = await fetch('/api/generate/classification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: this._skill }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const { rules, followUpPolicy, recommendedActions } = await res.json();
      this._skill.step4 = { classificationRules: rules, followUpPolicy, recommendedActions };
      this._step4Generated = true;
      if (panel) panel.innerHTML = this._renderStep4();
      showToast(`✨ ${rules.length} classification rules generated by Gemini AI`, 'success');
    } catch (err) {
      console.warn('Gemini classification failed, using rule-based fallback:', err.message);
      this._autoGenerateClassificationRuleBased();
    }
  },

  _autoGenerateClassificationRuleBased() {
    const tests        = this._skill.step3?.tests || [];
    const step1        = this._skill.step1 || {};
    const inherentRisk = step1.inherentRisk || 'High';
    const materiality  = step1.materialityUsd || 10000;

    const typeRiskMap = {
      population_100pct: { High:'High', Moderate:'Medium', Low:'Medium', Critical:'High' },
      analytical:        { High:'High', Moderate:'High',   Low:'Medium', Critical:'High' },
      sampling:          { High:'Medium',Moderate:'Medium',Low:'Low',    Critical:'High' },
    };
    const catFromName = n => {
      const l = (n||'').toLowerCase();
      if (l.includes('split') || l.includes('duplicate')) return 'Fraud Indicator';
      if (l.includes('match') || l.includes('variance'))  return 'Process Gap';
      if (l.includes('cut-off') || l.includes('period'))  return 'Compliance Issue';
      return 'Control Deficiency';
    };
    const rules = tests.map(t => {
      const defaultRisk  = (typeRiskMap[t.type] || {})[inherentRisk] || 'Medium';
      const escThreshold = defaultRisk === 'Medium' ? materiality * 5 : null;
      return { testId: t.id, findingTitle: this._findingTitleFrom(t), defaultRisk, riskLevel: defaultRisk,
        category: catFromName(t.name), followUp: defaultRisk !== 'Low',
        escalation: escThreshold ? [{ ifAmountGt: escThreshold, thenRisk:'High' }] : [], _autoGenerated: true };
    });
    const hiRisk = inherentRisk === 'High' || inherentRisk === 'Critical';
    this._skill.step4 = {
      classificationRules: rules,
      followUpPolicy: { high:{ responseDueDays: hiRisk?10:15 }, medium:{ responseDueDays:30 }, low:{ responseDueDays:60 } },
      recommendedActions: {
        High:   'Immediate escalation to senior management; root-cause investigation within 5 business days.',
        Medium: 'Management response within 30 days; audit to validate remediation in next cycle.',
        Low:    'Process owner to document corrective action by next audit cycle.',
      },
    };
    this._step4Generated = true;
    const panel = document.getElementById('step4-panel');
    if (panel) panel.innerHTML = this._renderStep4();
    else this._renderWizard(document.getElementById('view-container'));
    showToast(`✨ ${rules.length} classification rules generated`, 'success');
  },

  _findingTitleFrom(t) {
    const name = (t.name || '').toLowerCase();
    if (name.includes('missing') || name.includes('null')) return `${t.name} — Control Bypass Risk`;
    if (name.includes('match') || name.includes('variance')) return `Invoice–PO Variance Exceptions`;
    if (name.includes('split')) return `Split Payment Pattern Detected`;
    if (name.includes('duplicate')) return `Duplicate Invoice Identified`;
    if (name.includes('sample')) return `High-Value Items Requiring Verification`;
    if (name.includes('cut-off')) return `Period Cut-Off Exception`;
    return t.name || 'Exception Finding';
  },

  _toTitle(str) {
    return str.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  _goStep(n) {
    this._collectCurrentStep();
    const prev = this._step;
    this._step = n;

    // Auto-generate on first arrival at Step 3 (if empty)
    if (n === 3 && !this._step3Generated && (this._skill.step3?.tests||[]).length === 0) {
      this._renderWizard(document.getElementById('view-container'));
      setTimeout(() => this._autoGenerateTests(false), 200);
      return;
    }
    // Auto-generate on first arrival at Step 4 (if empty)
    if (n === 4 && !this._step4Generated && (this._skill.step4?.classificationRules||[]).length === 0) {
      this._renderWizard(document.getElementById('view-container'));
      setTimeout(() => this._autoGenerateClassification(false), 200);
      return;
    }

    this._renderWizard(document.getElementById('view-container'));
  },

  // ── Collect form values from current step ─────────────────────────────────
  _collectCurrentStep() {
    try {
      if (this._step === 1) {
        this._skill.name             = document.getElementById('f-name')?.value?.trim() || this._skill.name;
        this._skill.shortDescription = document.getElementById('f-desc')?.value || this._skill.shortDescription;
        this._skill.step1.auditObjective = document.getElementById('f-objective')?.value || this._skill.step1.auditObjective;
        this._skill.step1.scope          = document.getElementById('f-scope')?.value || this._skill.step1.scope;
        this._skill.step1.materialityUsd = Number(document.getElementById('f-materiality')?.value) || 10000;
        this._skill.step1.inherentRisk   = document.getElementById('f-inherent-risk')?.value || 'High';
        this._skill.step1.auditPeriod    = { label: document.getElementById('f-period')?.value || '' };
        this._skill.meta.category        = document.getElementById('f-category')?.value || '';
        this._skill.step1.assertions     = Array.from(document.querySelectorAll('.f-assertion:checked')).map(el => el.value);
        // Changing step1 invalidates generated tests
        this._step3Generated = false;
        this._step4Generated = false;
      }
      if (this._step === 2) {
        this._skill.step2.qualityGate = {
          maxNullRateBlocking: Number(document.getElementById('f-qg-null')?.value) || 0.10,
          maxDupRateBlocking:  Number(document.getElementById('f-qg-dup')?.value)  || 0.05,
          minRowCount:         Number(document.getElementById('f-qg-rows')?.value) || 5,
        };
        const dedupStr = document.getElementById('f-dedup')?.value || 'invoice_id';
        this._skill.step2.dedupKeys = dedupStr.split(',').map(s => s.trim()).filter(Boolean);
        // Changing fields invalidates generated tests
        this._step3Generated = false;
        this._step4Generated = false;
      }
      if (this._step === 4) {
        const hiDays  = Number(document.getElementById('f-fp-high')?.value) || 15;
        const medDays = Number(document.getElementById('f-fp-med')?.value)  || 30;
        const lowDays = Number(document.getElementById('f-fp-low')?.value)  || 60;
        this._skill.step4.followUpPolicy = {
          high:   { responseDueDays: hiDays },
          medium: { responseDueDays: medDays },
          low:    { responseDueDays: lowDays },
        };
        this._skill.step4.recommendedActions = {
          High:   document.getElementById('f-ra-high')?.value || '',
          Medium: document.getElementById('f-ra-med')?.value  || '',
          Low:    document.getElementById('f-ra-low')?.value  || '',
        };
      }
    } catch(_) {}
  },

  // ── Field management ─────────────────────────────────────────────────────
  _fieldChanged(i, key, val) {
    if (!this._skill.step2.fieldMappings[i]) return;
    this._skill.step2.fieldMappings[i][key] = val;
  },
  _addField() {
    if (!this._skill.step2.fieldMappings) this._skill.step2.fieldMappings = [];
    const i = this._skill.step2.fieldMappings.length;
    const f = { logicalName:'', displayName:'', dataType:'Text', required:false, nullHandling:'flag_as_exception' };
    this._skill.step2.fieldMappings.push(f);
    const tbody = document.getElementById('field-tbody');
    if (tbody) tbody.insertAdjacentHTML('beforeend', this._fieldRow(f, i));
  },
  _removeField(i) {
    this._skill.step2.fieldMappings.splice(i, 1);
    // Re-render step 2 to keep indices in sync
    const panel = document.getElementById('step2-panel');
    if (panel) panel.innerHTML = this._renderStep2();
  },

  // ── Test management ──────────────────────────────────────────────────────
  _testChanged(i, key, val) {
    if (!this._skill.step3.tests[i]) return;
    this._skill.step3.tests[i][key] = val;
  },
  _testChangedJson(i, key, val) {
    try { this._skill.step3.tests[i][key] = JSON.parse(val); } catch(_) {}
  },
  _addTest(type) {
    if (!this._skill.step3.tests) this._skill.step3.tests = [];
    const i = this._skill.step3.tests.length;
    const t = {
      id: `T${String(i+1).padStart(2,'0')}`,
      name: 'New Test', type,
      objective: '',
      criteria: type === 'population_100pct' ? { op:'null_when', field:'po_number', condition:{ field:'invoice_amount', op:'gt', value:10000 } }
               : type === 'analytical'        ? { type:'split_payment', windowDays:3, amountThreshold:5000 }
               : { sampleSize:25, selection:'top_risk' },
    };
    this._skill.step3.tests.push(t);
    const list = document.getElementById('test-list');
    if (list) list.insertAdjacentHTML('beforeend', this._testCard(t, i));
    // Show add buttons if banner was hidden
    const banner = document.getElementById('gen-banner');
    if (!banner) this._renderStep3();
  },
  _removeTest(i) {
    this._skill.step3.tests.splice(i, 1);
    const panel = document.getElementById('step3-panel');
    if (panel) panel.innerHTML = this._renderStep3();
  },

  // ── Rule management ──────────────────────────────────────────────────────
  _ruleChanged(i, key, val) {
    if (!this._skill.step4.classificationRules[i]) return;
    this._skill.step4.classificationRules[i][key] = val;
  },
  _ruleEscalation(i, val) {
    if (!this._skill.step4.classificationRules[i]) return;
    const thresh = Number(val);
    this._skill.step4.classificationRules[i].escalation = thresh ? [{ ifAmountGt: thresh, thenRisk:'High' }] : [];
  },
  _addRule() {
    if (!this._skill.step4.classificationRules) this._skill.step4.classificationRules = [];
    const r = { testId:'', riskLevel:'Medium', findingTitle:'', category:'Control Deficiency', followUp:true, escalation:[] };
    this._skill.step4.classificationRules.push(r);
    const list = document.getElementById('rules-list');
    const i = this._skill.step4.classificationRules.length - 1;
    if (list) list.insertAdjacentHTML('beforeend', this._ruleRow(r, i));
  },
  _removeRule(i) {
    this._skill.step4.classificationRules.splice(i, 1);
    const panel = document.getElementById('step4-panel');
    if (panel) panel.innerHTML = this._renderStep4();
  },

  // ── Save ─────────────────────────────────────────────────────────────────
  async _save(finish) {
    this._collectCurrentStep();
    if (!this._skill.name.trim()) { showToast('Skill name is required', 'error'); return; }
    try {
      let saved;
      if (this._skill.id) {
        saved = await API.skills.update(this._skill.id, this._skill);
      } else {
        saved = await API.skills.create(this._skill);
      }
      this._skill = saved;
      showToast(finish ? '✓ Skill saved to registry!' : '💾 Draft saved', 'success');
      if (finish) setTimeout(() => Router.go('/registry'), 900);
    } catch(e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  },
};
