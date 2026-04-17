/**
 * Dashboard view — overview stats + recent runs + recent findings
 */
const DashboardView = {
  async render() {
    document.getElementById('topbar-title').textContent = 'Dashboard';
    const el = document.getElementById('view-container');
    el.innerHTML = `<div class="loading-wrap"><div class="spinner"></div> Loading…</div>`;

    try {
      const [skills, runs, findings] = await Promise.all([
        API.skills.list(),
        API.runs.list(),
        API.findings.list(),
      ]);

      const totalExposure = findings.reduce((s, f) => s + (f.monetaryExposure || 0), 0);
      const highCount     = findings.filter(f => f.risk === 'High').length;
      const openCount     = findings.filter(f => f.status === 'open').length;
      const recentRuns    = runs.slice(0, 5);
      const recentFindings= findings.slice(0, 6);

      el.innerHTML = `
        <!-- Stats row -->
        <div class="stats-row">
          <div class="stat-card accent-navy">
            <div class="stat-label">Skills in Registry</div>
            <div class="stat-value">${skills.length}</div>
            <div class="stat-sub">${skills.filter(s=>s.status==='master').length} master · ${skills.filter(s=>s.status==='draft').length} draft</div>
          </div>
          <div class="stat-card accent-teal">
            <div class="stat-label">Audit Runs</div>
            <div class="stat-value">${runs.length}</div>
            <div class="stat-sub">${runs.filter(r=>r.status==='complete').length} complete · ${runs.filter(r=>r.status==='running').length} in-progress</div>
          </div>
          <div class="stat-card accent-gold">
            <div class="stat-label">Total Findings</div>
            <div class="stat-value">${findings.length}</div>
            <div class="stat-sub">${highCount} high-risk · ${openCount} open</div>
          </div>
          <div class="stat-card accent-red">
            <div class="stat-label">Monetary Exposure</div>
            <div class="stat-value">${DashboardView.fmtMoney(totalExposure)}</div>
            <div class="stat-sub">across ${findings.filter(f=>f.monetaryExposure>0).length} findings</div>
          </div>
        </div>

        <!-- Recent runs -->
        <div class="section-header mb-16">
          <div class="section-title">Recent Audit Runs</div>
          <button class="btn btn-ghost btn-sm" onclick="Router.go('/runs')">View all →</button>
        </div>
        <div class="table-wrap mb-24">
          <table>
            <thead><tr>
              <th>Run Name</th><th>Skill</th><th>Status</th>
              <th>Exceptions</th><th>Exposure</th><th>Date</th><th></th>
            </tr></thead>
            <tbody>
              ${recentRuns.length ? recentRuns.map(r => `
                <tr>
                  <td class="fw-700">${escHtml(r.name)}</td>
                  <td>${escHtml(DashboardView.skillName(r.skillId, skills))}</td>
                  <td><span class="badge badge-${r.status}">${r.status}</span></td>
                  <td>${r.totalExceptions ?? '—'}</td>
                  <td>${r.totalExposure ? DashboardView.fmtMoney(r.totalExposure) : '—'}</td>
                  <td class="td-muted">${DashboardView.fmtDate(r.startedAt)}</td>
                  <td>
                    ${r.status === 'complete' ? `
                      <a href="${API.runs.exportExcelUrl(r.id)}" class="btn btn-ghost btn-sm">Excel</a>
                      <a href="${API.runs.exportPdfUrl(r.id)}" class="btn btn-ghost btn-sm">PDF</a>
                    ` : r.status === 'running' ? `
                      <span class="badge badge-running">Running…</span>
                    ` : ''}
                  </td>
                </tr>`) .join('') : `
                <tr><td colspan="7">
                  <div class="empty-state" style="padding:32px">
                    <div class="empty-state-icon">▶</div>
                    <h3>No runs yet</h3>
                    <p>Go to <a href="#/runs" style="color:var(--teal)">Audit Runs</a> to start your first audit.</p>
                  </div>
                </td></tr>`}
            </tbody>
          </table>
        </div>

        <!-- Recent findings -->
        <div class="section-header mb-16">
          <div class="section-title">Recent Findings</div>
          <button class="btn btn-ghost btn-sm" onclick="Router.go('/findings')">View all →</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>ID</th><th>Title</th><th>Risk</th><th>Exceptions</th><th>Exposure</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${recentFindings.length ? recentFindings.map(f => `
                <tr>
                  <td class="td-muted fw-700">${escHtml(f.id)}</td>
                  <td>${escHtml(f.title || f.testName)}</td>
                  <td><span class="badge badge-${f.risk?.toLowerCase()}">${f.risk}</span></td>
                  <td>${f.exceptionCount}</td>
                  <td>${f.monetaryExposure ? DashboardView.fmtMoney(f.monetaryExposure) : '—'}</td>
                  <td><span class="badge badge-${f.status}">${f.status}</span></td>
                </tr>`).join('') : `
                <tr><td colspan="6">
                  <div class="empty-state" style="padding:32px">
                    <div class="empty-state-icon">🔍</div>
                    <h3>No findings yet</h3>
                    <p>Run an audit to generate findings.</p>
                  </div>
                </td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    } catch(e) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error loading dashboard</h3><p>${escHtml(e.message)}</p></div>`;
    }
  },

  skillName(skillId, skills) {
    const s = skills.find(sk => sk.id === skillId);
    return s ? s.name : skillId;
  },

  fmtMoney(val) {
    if (!val && val !== 0) return '—';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },

  fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
};
