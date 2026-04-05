/**
 * Audit Runs view — list all runs + start new run modal + run detail
 */
const RunsView = {
  _pollTimers: {},

  async render() {
    document.getElementById('topbar-title').textContent = 'Audit Runs';
    const el = document.getElementById('view-container');
    el.innerHTML = `<div class="loading-wrap"><div class="spinner"></div> Loading runs…</div>`;

    try {
      const [runs, skills] = await Promise.all([API.runs.list(), API.skills.list()]);
      this._renderList(el, runs, skills);
    } catch(e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${escHtml(e.message)}</p></div>`;
    }
  },

  _renderList(el, runs, skills) {
    el.innerHTML = `
      <div class="section-header mb-16">
        <div class="section-title">Audit Runs</div>
        <button class="btn btn-primary" onclick="RunsView._openNewRunModal()">▶ New Run</button>
      </div>

      ${!runs.length ? `
        <div class="empty-state">
          <div class="empty-state-icon">▶</div>
          <h3>No runs yet</h3>
          <p>Click <strong>New Run</strong> to execute an audit skill against your data.</p>
        </div>` : `
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Run Name</th><th>Skill</th><th>Status</th>
              <th>In Scope</th><th>Exceptions</th><th>Exposure</th><th>Started</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${runs.map(r => `
                <tr>
                  <td>
                    <div class="fw-700" style="cursor:pointer;color:var(--navy)" onclick="RunsView._openRunDetail('${r.id}')">${escHtml(r.name)}</div>
                    <div class="td-muted">${r.id.slice(0,8)}…</div>
                  </td>
                  <td>${escHtml(RunsView._skillName(r.skillId, skills))}</td>
                  <td id="run-status-${r.id}">
                    <span class="badge badge-${r.status}">${r.status}</span>
                    ${r.status === 'running' ? `<div class="run-progress-wrap" style="margin-top:6px">
                      <div class="run-stage-label fs-11">${escHtml(r.progress?.stage||'')}</div>
                      <div class="progress-bar"><div class="progress-fill" id="run-fill-${r.id}" style="width:${r.progress?.pct||10}%"></div></div>
                    </div>` : ''}
                  </td>
                  <td>${r.inScopeRows ?? '—'}</td>
                  <td>${r.totalExceptions ?? '—'}</td>
                  <td>${r.totalExposure ? '$'+Number(r.totalExposure).toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}</td>
                  <td class="td-muted">${RunsView._fmtDate(r.startedAt)}</td>
                  <td>
                    ${r.status === 'complete' ? `
                      <div class="flex gap-8">
                        <button class="btn btn-ghost btn-sm" onclick="RunsView._openRunDetail('${r.id}')">Detail</button>
                        <a href="${API.runs.exportExcelUrl(r.id)}" class="btn btn-teal btn-sm">Excel</a>
                        <a href="${API.runs.exportPdfUrl(r.id)}" class="btn btn-gold btn-sm">PDF</a>
                      </div>` : r.status === 'error' ? `
                      <span class="badge badge-error" title="${escHtml(r.error||'')}">Error</span>` : ''}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
    `;

    // Start polling for any running runs
    runs.filter(r => r.status === 'running').forEach(r => this._pollRun(r.id));
  },

  async _openNewRunModal(preSkillId, preSkillName) {
    let skills = [];
    try { skills = await API.skills.list(); } catch(_) {}

    openModal(`
      <div class="modal-header">
        <div class="modal-title">Start New Audit Run</div>
        <button class="modal-close" onclick="closeModal()">×</button>
      </div>

      <div class="form-group">
        <label class="form-label">Select Skill <span class="req">*</span></label>
        <select class="form-select" id="run-skill-id">
          <option value="">Choose a skill…</option>
          ${skills.map(s => `<option value="${s.id}" ${s.id===preSkillId?'selected':''}>${escHtml(s.name)} (v${s.version})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Run Name</label>
        <input class="form-input" id="run-name" placeholder="Auto-generated if blank"/>
      </div>
      <div class="form-group">
        <label class="form-label">Upload Data File</label>
        <div class="file-drop" id="file-drop-zone" onclick="document.getElementById('run-file-input').click()">
          <input type="file" id="run-file-input" accept=".xlsx,.xls,.csv" onchange="RunsView._handleFileSelect(this)"/>
          <div class="file-drop-icon">📂</div>
          <div class="file-drop-label"><strong>Click to upload</strong> or drag & drop<br/>
            <span class="fs-11">.xlsx, .xls, .csv · max 50MB</span></div>
          <div id="file-name-label" style="display:none;margin-top:8px;font-size:12px;color:var(--teal);font-weight:600"></div>
        </div>
        <div class="form-hint">Leave empty to run against <strong>synthetic demo data</strong> (great for testing!).</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="RunsView._submitRun()">▶ Start Run</button>
      </div>
    `);

    // Drag-and-drop
    const zone = document.getElementById('file-drop-zone');
    if (zone) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f) { document.getElementById('run-file-input').files = e.dataTransfer.files; RunsView._handleFileSelect({ files:[f] }); }
      });
    }
  },

  _handleFileSelect(input) {
    const f = input.files && input.files[0];
    const label = document.getElementById('file-name-label');
    if (f && label) { label.style.display = 'block'; label.textContent = '✓ ' + f.name; }
  },

  async _submitRun() {
    const skillId  = document.getElementById('run-skill-id')?.value;
    const runName  = document.getElementById('run-name')?.value;
    const fileInput= document.getElementById('run-file-input');
    const file     = fileInput?.files?.[0];

    if (!skillId) { showToast('Please select a skill', 'error'); return; }

    try {
      const { runId } = await API.runs.start(skillId, runName, file);
      closeModal();
      showToast('Run started — processing…', 'success');
      await this.render();
      this._pollRun(runId);
    } catch(e) {
      showToast('Failed to start run: ' + e.message, 'error');
    }
  },

  async _startRunForSkill(skillId, skillName) {
    closeModal();
    await this._openNewRunModal(skillId, skillName);
  },

  _pollRun(runId) {
    if (this._pollTimers[runId]) return;
    this._pollTimers[runId] = setInterval(async () => {
      try {
        const run = await API.runs.get(runId);
        const statusCell = document.getElementById(`run-status-${runId}`);
        const fillBar    = document.getElementById(`run-fill-${runId}`);

        if (run.status === 'running') {
          if (fillBar) fillBar.style.width = (run.progress?.pct || 10) + '%';
          if (statusCell) {
            const stageEl = statusCell.querySelector('.run-stage-label');
            if (stageEl) stageEl.textContent = run.progress?.stage || '';
          }
        } else {
          clearInterval(this._pollTimers[runId]);
          delete this._pollTimers[runId];
          // Re-render the full list
          const [runs, skills] = await Promise.all([API.runs.list(), API.skills.list()]);
          this._renderList(document.getElementById('view-container'), runs, skills);
          if (run.status === 'complete') {
            showToast(`Run complete — ${run.totalExceptions} exceptions found`, 'success');
            App.refreshBadges();
          } else if (run.status === 'error') {
            showToast('Run failed: ' + run.error, 'error');
          }
        }
      } catch(_) {}
    }, 2000);
  },

  async _openRunDetail(runId) {
    try {
      const [run, skills] = await Promise.all([API.runs.get(runId), API.skills.list()]);
      const skill = skills.find(s => s.id === run.skillId);
      const findings = await API.findings.list({ runId });
      const dq = run.dataQuality || {};

      openModal(`
        <div class="modal-header">
          <div class="modal-title">${escHtml(run.name)}</div>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>

        <div class="run-meta-grid">
          <div class="run-meta-item">
            <div class="run-meta-label">Status</div>
            <div><span class="badge badge-${run.status}">${run.status}</span></div>
          </div>
          <div class="run-meta-item">
            <div class="run-meta-label">In-Scope Rows</div>
            <div class="run-meta-value">${(run.inScopeRows||0).toLocaleString()}</div>
          </div>
          <div class="run-meta-item">
            <div class="run-meta-label">Exceptions</div>
            <div class="run-meta-value">${run.totalExceptions||0}</div>
          </div>
          <div class="run-meta-item">
            <div class="run-meta-label">Exposure</div>
            <div class="run-meta-value">${run.totalExposure ? '$'+Number(run.totalExposure).toLocaleString('en-US',{maximumFractionDigits:0}) : '—'}</div>
          </div>
        </div>

        <div class="divider"></div>
        <div class="card-title mb-16" style="margin-top:4px">Data Quality</div>
        <div class="flex gap-12" style="flex-wrap:wrap;font-size:12px">
          <div class="quality-item quality-ok">✓ ${dq.totalRows||0} total rows</div>
          <div class="quality-item quality-ok">✓ ${dq.inScopeRows||0} in scope</div>
          ${(dq.duplicateRows||0) > 0 ? `<div class="quality-item quality-warn">⚠ ${dq.duplicateRows} duplicates</div>` : ''}
          ${(dq.rejectedRows||0) > 0  ? `<div class="quality-item quality-fail">✗ ${dq.rejectedRows} rejected</div>` : ''}
          ${dq.blocked ? `<div class="quality-item quality-fail">✗ Quality gate BLOCKED</div>` : ''}
        </div>

        <div class="divider"></div>
        <div class="card-title mb-16" style="margin-top:4px">Test Results</div>
        <div class="table-wrap" style="margin-bottom:16px">
          <table>
            <thead><tr><th>Test</th><th>Name</th><th>Type</th><th>Exceptions</th><th>Exception Rate</th></tr></thead>
            <tbody>
              ${(run.testResults||[]).map(t => `
                <tr>
                  <td class="fw-700">${escHtml(t.testId)}</td>
                  <td>${escHtml(t.testName||'')}</td>
                  <td><span class="test-type-badge test-type-${t.type}">${t.type}</span></td>
                  <td>${t.exceptionCount||0}</td>
                  <td>${t.exceptionRate !== undefined ? (t.exceptionRate*100).toFixed(1)+'%' : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="card-title mb-16">Findings (${findings.length})</div>
        ${findings.map(f => `
          <div style="padding:10px 12px;margin-bottom:8px;background:var(--bg);border-radius:8px;border-left:4px solid ${f.risk==='High'?'var(--red)':f.risk==='Medium'?'var(--amber)':'var(--green)'}">
            <div class="flex-center gap-8 mb-16"><span class="badge badge-${f.risk?.toLowerCase()}">${f.risk}</span> <strong>${escHtml(f.title)}</strong></div>
            <div class="fs-12 color-muted">${escHtml(f.condition||'')} · ${f.exceptionCount} exceptions · ${f.monetaryExposure ? '$'+Number(f.monetaryExposure).toLocaleString('en-US',{maximumFractionDigits:0}) : 'N/A'} exposure</div>
          </div>`).join('')}

        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Close</button>
          ${run.status === 'complete' ? `
            <a href="${API.runs.exportExcelUrl(run.id)}" class="btn btn-teal">Download Excel</a>
            <a href="${API.runs.exportPdfUrl(run.id)}" class="btn btn-gold">Download PDF</a>
          ` : ''}
        </div>
      `);
    } catch(e) {
      showToast('Error loading run: ' + e.message, 'error');
    }
  },

  _skillName(id, skills) {
    return (skills.find(s => s.id === id) || {}).name || id;
  },
  _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
  },
};
