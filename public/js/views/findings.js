/**
 * Findings Register view — list, filter, expand, update status / management response
 */
const FindingsView = {
  _findings: [],
  _filter: { risk: 'all', status: 'all' },

  async render() {
    document.getElementById('topbar-title').textContent = 'Findings Register';
    const el = document.getElementById('view-container');
    el.innerHTML = `<div class="loading-wrap"><div class="spinner"></div> Loading findings…</div>`;

    try {
      this._findings = await API.findings.list();
      this._renderContent(el);
    } catch(e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${escHtml(e.message)}</p></div>`;
    }
  },

  _renderContent(el) {
    const f = this._findings;
    const highCount   = f.filter(x => x.risk === 'High').length;
    const medCount    = f.filter(x => x.risk === 'Medium').length;
    const lowCount    = f.filter(x => x.risk === 'Low').length;
    const openCount   = f.filter(x => x.status === 'open').length;
    const totalExp    = f.reduce((s, x) => s + (x.monetaryExposure||0), 0);

    el.innerHTML = `
      <!-- Summary stats -->
      <div class="stats-row mb-24" style="grid-template-columns:repeat(5,1fr)">
        <div class="stat-card accent-navy">
          <div class="stat-label">Total Findings</div>
          <div class="stat-value">${f.length}</div>
        </div>
        <div class="stat-card accent-red">
          <div class="stat-label">High Risk</div>
          <div class="stat-value">${highCount}</div>
        </div>
        <div class="stat-card accent-gold">
          <div class="stat-label">Medium Risk</div>
          <div class="stat-value">${medCount}</div>
        </div>
        <div class="stat-card accent-teal">
          <div class="stat-label">Low Risk</div>
          <div class="stat-value">${lowCount}</div>
        </div>
        <div class="stat-card accent-red">
          <div class="stat-label">Open Findings</div>
          <div class="stat-value">${openCount}</div>
          <div class="stat-sub">$${Number(totalExp).toLocaleString('en-US',{maximumFractionDigits:0})} exposure</div>
        </div>
      </div>

      <div class="section-header mb-16">
        <div class="section-title">All Findings</div>
      </div>

      <div class="filter-bar mb-16" id="findings-filter-bar">
        <span style="font-size:12px;color:var(--muted);margin-right:4px">Risk:</span>
        <div class="chip ${this._filter.risk==='all'?'active':''}"    data-type="risk" data-val="all">All</div>
        <div class="chip ${this._filter.risk==='High'?'active':''}"   data-type="risk" data-val="High">High</div>
        <div class="chip ${this._filter.risk==='Medium'?'active':''}" data-type="risk" data-val="Medium">Medium</div>
        <div class="chip ${this._filter.risk==='Low'?'active':''}"    data-type="risk" data-val="Low">Low</div>
        <span style="font-size:12px;color:var(--muted);margin-left:8px;margin-right:4px">Status:</span>
        <div class="chip ${this._filter.status==='all'?'active':''}"      data-type="status" data-val="all">All</div>
        <div class="chip ${this._filter.status==='open'?'active':''}"     data-type="status" data-val="open">Open</div>
        <div class="chip ${this._filter.status==='resolved'?'active':''}" data-type="status" data-val="resolved">Resolved</div>
        <div class="chip ${this._filter.status==='in_progress'?'active':''}" data-type="status" data-val="in_progress">In Progress</div>
      </div>

      <div id="findings-table-area"></div>
    `;

    el.querySelectorAll('#findings-filter-bar .chip').forEach(c => {
      c.addEventListener('click', () => {
        const type = c.dataset.type, val = c.dataset.val;
        this._filter[type] = val;
        el.querySelectorAll(`#findings-filter-bar .chip[data-type="${type}"]`).forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        this._renderTable();
      });
    });

    this._renderTable();
  },

  _filtered() {
    let list = this._findings;
    if (this._filter.risk   !== 'all') list = list.filter(f => f.risk === this._filter.risk);
    if (this._filter.status !== 'all') list = list.filter(f => f.status === this._filter.status);
    return list;
  },

  _renderTable() {
    const area = document.getElementById('findings-table-area');
    if (!area) return;
    const list = this._filtered();

    if (!list.length) {
      area.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>No findings match the filter</h3>
        <p>Run an audit to generate findings, or adjust the filter.</p>
      </div>`;
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>ID</th><th>Title</th><th>Risk</th><th>Test</th>
            <th>Exceptions</th><th>Exposure</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody id="findings-tbody">
            ${list.map(f => this._findingRow(f)).join('')}
          </tbody>
        </table>
      </div>`;

    // Expand rows
    area.querySelectorAll('.finding-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('select') || e.target.closest('textarea')) return;
        const id = row.dataset.id;
        const expandRow = document.getElementById(`expand-${id}`);
        if (!expandRow) return;
        const isOpen = expandRow.classList.contains('open');
        // Close all
        area.querySelectorAll('.finding-expand').forEach(x => x.classList.remove('open'));
        if (!isOpen) expandRow.classList.add('open');
      });
    });
  },

  _findingRow(f) {
    const riskColor = f.risk === 'High' ? 'var(--red)' : f.risk === 'Medium' ? 'var(--amber)' : 'var(--green)';
    return `
      <tr class="finding-row" data-id="${f.id}" style="cursor:pointer">
        <td class="fw-700 td-muted">${escHtml(f.id)}</td>
        <td>
          <div class="fw-700" style="color:var(--navy)">${escHtml(f.title || f.testName)}</div>
          <div class="td-muted">${escHtml((f.condition||'').slice(0,80))}${(f.condition||'').length>80?'…':''}</div>
        </td>
        <td>
          <div class="flex-center gap-8">
            <div class="risk-dot risk-dot-${f.risk?.toLowerCase()}"></div>
            <span class="badge badge-${f.risk?.toLowerCase()}">${f.risk}</span>
          </div>
        </td>
        <td class="td-muted">${escHtml(f.testId||'—')}</td>
        <td><strong>${f.exceptionCount||0}</strong></td>
        <td>${f.monetaryExposure ? '<span class="exposure-val">$'+Number(f.monetaryExposure).toLocaleString('en-US',{maximumFractionDigits:0})+'</span>' : '—'}</td>
        <td><span class="badge badge-${f.status}">${f.status||'open'}</span></td>
        <td>
          <select class="form-select" style="padding:4px 8px;font-size:12px;width:130px"
            onchange="FindingsView._updateStatus('${f.id}',this.value)" onclick="event.stopPropagation()">
            <option value="open"        ${(f.status||'open')==='open'?'selected':''}>Open</option>
            <option value="in_progress" ${f.status==='in_progress'?'selected':''}>In Progress</option>
            <option value="resolved"    ${f.status==='resolved'?'selected':''}>Resolved</option>
          </select>
        </td>
      </tr>
      <tr id="expand-${f.id}">
        <td colspan="8" style="padding:0">
          <div class="finding-expand" id="expand-content-${f.id}">
            <div class="finding-expand-grid" style="margin-bottom:14px">
              <div class="finding-field">
                <label>Condition</label>
                <p>${escHtml(f.condition||'—')}</p>
              </div>
              <div class="finding-field">
                <label>Root Cause</label>
                <p>${escHtml(f.rootCause||f.criteria||'—')}</p>
              </div>
              <div class="finding-field">
                <label>Impact</label>
                <p>${escHtml(f.impact||'—')}</p>
              </div>
              <div class="finding-field">
                <label>Recommended Action</label>
                <p>${escHtml(f.recommendedAction||'—')}</p>
              </div>
            </div>
            <div class="finding-field">
              <label>Management Response</label>
              <textarea class="form-textarea" style="font-size:12px" rows="2"
                placeholder="Enter management response…"
                onchange="FindingsView._saveMgmtResponse('${f.id}',this.value)"
              >${escHtml(f.managementResponse||'')}</textarea>
            </div>
            <div class="flex gap-8 mt-16">
              <button class="btn btn-ghost btn-sm" onclick="FindingsView._saveMgmtResponse('${f.id}',document.querySelector('#expand-content-${f.id} textarea').value)">Save Response</button>
            </div>
          </div>
        </td>
      </tr>`;
  },

  async _updateStatus(id, status) {
    try {
      const updated = await API.findings.update(id, { status });
      const idx = this._findings.findIndex(f => f.id === id);
      if (idx >= 0) this._findings[idx] = updated;
      showToast('Status updated ✓', 'success');
      // Update badge in the row without full re-render
      const statusCell = document.querySelector(`tr[data-id="${id}"] .badge`);
      if (statusCell) { statusCell.className = `badge badge-${status}`; statusCell.textContent = status; }
      App.refreshBadges();
    } catch(e) {
      showToast('Update failed: ' + e.message, 'error');
    }
  },

  async _saveMgmtResponse(id, response) {
    try {
      const updated = await API.findings.update(id, { managementResponse: response });
      const idx = this._findings.findIndex(f => f.id === id);
      if (idx >= 0) this._findings[idx] = updated;
      showToast('Response saved ✓', 'success');
    } catch(e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  },
};
