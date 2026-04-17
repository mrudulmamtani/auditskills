/**
 * Skill Registry view — grid of skill cards with filter chips + search
 */
const RegistryView = {
  _skills: [],
  _filter: { status: 'all', level: 'all', q: '' },

  async render() {
    document.getElementById('topbar-title').textContent = 'Skill Registry';
    const el = document.getElementById('view-container');
    el.innerHTML = `<div class="loading-wrap"><div class="spinner"></div> Loading skills…</div>`;

    try {
      this._skills = await API.skills.list();
      this._renderContent(el);
      // Sync search box value in case it was pre-set from global search navigation
      const searchEl = document.getElementById('global-search');
      if (searchEl && this._filter.q) {
        searchEl.value = this._filter.q;
      }
    } catch(e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${escHtml(e.message)}</p></div>`;
    }
  },

  _renderContent(el) {
    const s = this._skills;
    el.innerHTML = `
      <div class="section-header mb-16">
        <div class="section-title">Skill Registry <span class="color-muted fs-12">(${s.length} skills)</span></div>
        <button class="btn btn-primary" onclick="Router.go('/builder')">+ New Skill</button>
      </div>

      <div class="filter-bar" id="filter-bar">
        <span style="font-size:12px;color:var(--muted);margin-right:4px">Status:</span>
        <div class="chip ${this._filter.status==='all'?'active':''}"    data-type="status" data-val="all">All</div>
        <div class="chip ${this._filter.status==='master'?'active':''}" data-type="status" data-val="master">Master</div>
        <div class="chip ${this._filter.status==='draft'?'active':''}"  data-type="status" data-val="draft">Draft</div>
        <span style="font-size:12px;color:var(--muted);margin-left:8px;margin-right:4px">Level:</span>
        <div class="chip ${this._filter.level==='all'?'active':''}"        data-type="level" data-val="all">All</div>
        <div class="chip ${this._filter.level==='personal'?'active':''}"   data-type="level" data-val="personal">Personal</div>
        <div class="chip ${this._filter.level==='team'?'active':''}"       data-type="level" data-val="team">Team</div>
        <div class="chip ${this._filter.level==='organisation'?'active':''}" data-type="level" data-val="organisation">Organisation</div>
      </div>

      <div id="skill-grid-area"></div>
    `;

    // Filter chip clicks
    el.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => {
        const type = c.dataset.type, val = c.dataset.val;
        this._filter[type] = val;
        el.querySelectorAll(`.chip[data-type="${type}"]`).forEach(x => x.classList.remove('active'));
        c.classList.add('active');
        this._renderGrid();
      });
    });

    // Global search feed (from topbar)
    this._renderGrid();
  },

  _filtered() {
    let list = this._skills;
    const q = (this._filter.q || '').toLowerCase();
    if (this._filter.status !== 'all') list = list.filter(s => s.status === this._filter.status);
    if (this._filter.level  !== 'all') list = list.filter(s => s.registryLevel === this._filter.level);
    if (q) list = list.filter(s => s.name.toLowerCase().includes(q) || (s.shortDescription||'').toLowerCase().includes(q));
    return list;
  },

  _renderGrid() {
    const area = document.getElementById('skill-grid-area');
    if (!area) return;
    const list = this._filtered();

    if (!list.length) {
      area.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <h3>No skills found</h3>
        <p>Try a different filter or <a href="#/builder" style="color:var(--teal)">create a new skill</a>.</p>
      </div>`;
      return;
    }

    area.innerHTML = `<div class="skill-grid">${list.map(s => this._skillCard(s)).join('')}</div>`;
    area.querySelectorAll('.skill-card').forEach(card => {
      card.addEventListener('click', () => this._openSkillModal(card.dataset.id));
    });
  },

  _skillCard(s) {
    const tests = (s.step3?.tests || []).length;
    const lastRun = s.meta?.lastModifiedAt ? new Date(s.meta.lastModifiedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const badgeClass = s.status === 'master' ? 'badge-master' : 'badge-draft';
    const levelClass = s.registryLevel === 'personal' ? 'badge-personal' : s.registryLevel === 'team' ? 'badge-running' : 'badge-complete';
    return `
      <div class="skill-card" data-id="${s.id}">
        <div class="skill-card-header">
          <div class="skill-card-name">${escHtml(s.name)}</div>
          <span class="badge ${badgeClass}">${s.status}</span>
        </div>
        <div class="skill-card-desc">${escHtml(s.shortDescription || 'No description')}</div>
        <div class="skill-card-meta">
          <span class="badge ${levelClass}">${s.registryLevel || 'personal'}</span>
          <span class="badge badge-draft">v${s.version}</span>
          ${s.meta?.category ? `<span class="badge badge-draft">${escHtml(s.meta.category)}</span>` : ''}
        </div>
        <div class="skill-card-footer">
          <span>📋 ${tests} test${tests !== 1 ? 's' : ''}</span>
          <span>▶ ${s.runCount || 0} run${(s.runCount||0) !== 1 ? 's' : ''}</span>
          <span>🕐 ${lastRun}</span>
        </div>
      </div>`;
  },

  async _openSkillModal(id) {
    try {
      const s = await API.skills.get(id);
      const versions = (s.versions || []).slice().reverse();
      const tests = s.step3?.tests || [];
      openModal(`
        <div class="modal-header">
          <div class="modal-title">${escHtml(s.name)}</div>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>

        <div class="flex-center gap-8 mb-16">
          <span class="badge ${s.status==='master'?'badge-master':'badge-draft'}">${s.status}</span>
          <span class="badge badge-personal">${s.registryLevel || 'personal'}</span>
          <span class="badge badge-draft">v${s.version}</span>
        </div>

        <p class="color-muted fs-12 mb-16">${escHtml(s.shortDescription || '')}</p>

        <div class="divider"></div>
        <div class="card-title mb-16" style="margin-top:12px">Objective</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:var(--muted);width:140px">Audit Objective</td><td>${escHtml(s.step1?.auditObjective||'—')}</td></tr>
          <tr><td style="padding:4px 0;color:var(--muted)">Assertions</td><td>${(s.step1?.assertions||[]).join(', ')||'—'}</td></tr>
          <tr><td style="padding:4px 0;color:var(--muted)">Materiality</td><td>${s.step1?.materialityUsd ? '$'+Number(s.step1.materialityUsd).toLocaleString() : '—'}</td></tr>
          <tr><td style="padding:4px 0;color:var(--muted)">Inherent Risk</td><td>${escHtml(s.step1?.inherentRisk||'—')}</td></tr>
        </table>

        <div class="divider"></div>
        <div class="card-title mb-16" style="margin-top:12px">Test Procedures (${tests.length})</div>
        ${tests.length ? tests.map(t => `
          <div class="test-card" style="margin-bottom:8px">
            <div class="test-card-header">
              <span class="test-card-title">${escHtml(t.id)}: ${escHtml(t.name)}</span>
              <span class="test-type-badge test-type-${t.type}">${t.type}</span>
            </div>
            <div class="fs-12 color-muted">${escHtml(t.objective||'')}</div>
          </div>`).join('') : '<p class="color-muted fs-12">No tests defined.</p>'}

        <div class="divider"></div>
        <div class="card-title mb-16" style="margin-top:12px">Version History</div>
        <div class="version-list">
          ${versions.map((v, i) => `
            <div class="version-item">
              <div class="version-dot-col">
                <div class="version-dot" style="${v.promoted?'background:var(--gold)':''}"></div>
                ${i < versions.length-1 ? '<div class="version-line"></div>' : ''}
              </div>
              <div class="version-content">
                <span class="version-tag">v${v.version}</span>
                ${v.promoted ? '<span class="badge badge-master" style="margin-left:4px">Promoted</span>' : ''}
                <div class="version-note">${escHtml(v.changes||'')}</div>
                <div class="fs-11 color-muted" style="margin-top:3px">${v.date} · ${escHtml(v.author||'user')}</div>
              </div>
            </div>`).join('')}
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Close</button>
          <button class="btn btn-ghost" onclick="RegistryView._editSkill('${s.id}')">Edit</button>
          ${s.status !== 'master' ? `<button class="btn btn-teal" onclick="RegistryView._promoteSkill('${s.id}')">Promote to Master</button>` : ''}
          <button class="btn btn-primary" onclick="RunsView._startRunForSkill('${s.id}','${escHtml(s.name).replace(/'/g,"\\'")}')">Run Audit ▶</button>
        </div>
      `);
    } catch(e) {
      showToast('Failed to load skill: ' + e.message, 'error');
    }
  },

  _editSkill(id) {
    closeModal();
    Router.go(`/builder?id=${id}`);
  },

  async _promoteSkill(id) {
    const rationale = prompt('Enter promotion rationale:');
    if (!rationale) return;
    try {
      await API.skills.promote(id, { rationale, approvedBy: 'manager' });
      showToast('Skill promoted to Master ✓', 'success');
      closeModal();
      this.render();
    } catch(e) {
      showToast('Promotion failed: ' + e.message, 'error');
    }
  },

  // Called from global search
  applySearch(q) {
    this._filter.q = q;
    this._renderGrid();
  },
};
