/**
 * AuditSkills — App bootstrap: Router, global helpers (toast, modal),
 * nav highlighting, badge refresh, search wiring.
 */

// ── Utility helpers ─────────────────────────────────────────────────────────
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast ────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show${type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : ''}`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-box');
  if (!overlay || !box) return;
  box.innerHTML = html;
  overlay.classList.add('open');
}
function closeModal(event) {
  if (event && event.target !== document.getElementById('modal-overlay')) return;
  _closeModalNow();
}
function _closeModalNow() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
}
// Allow programmatic close without event arg
window.closeModal = function(event) {
  if (!event) { _closeModalNow(); return; }
  closeModal(event);
};

// ── Router ────────────────────────────────────────────────────────────────────
const Router = {
  _routes: {
    '/dashboard': () => DashboardView.render(),
    '/registry':  () => RegistryView.render(),
    '/builder':   (params) => BuilderView.render(params),
    '/runs':      () => RunsView.render(),
    '/findings':  () => FindingsView.render(),
  },

  init() {
    window.addEventListener('hashchange', () => this._dispatch());
    this._dispatch();
  },

  go(path) {
    window.location.hash = '#' + path;
  },

  _dispatch() {
    const raw    = window.location.hash.replace(/^#/, '') || '/dashboard';
    const [path, qs] = raw.split('?');
    const params = {};
    if (qs) qs.split('&').forEach(p => { const [k,v] = p.split('='); params[k] = decodeURIComponent(v||''); });

    const handler = this._routes[path] || this._routes['/dashboard'];

    // Nav highlight
    document.querySelectorAll('.nav-item').forEach(a => {
      const route = a.dataset.route;
      a.classList.toggle('active', path === '/' + route);
    });

    // Clear search input on route change
    const searchEl = document.getElementById('global-search');
    if (searchEl) searchEl.value = '';

    handler(params);
    App.refreshBadges();
  },
};

// ── App ───────────────────────────────────────────────────────────────────────
const App = {
  init() {
    // Global search wiring
    const searchEl = document.getElementById('global-search');
    if (searchEl) {
      let debounce;

      // Submit on Enter
      searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = searchEl.value.trim();
          if (q) {
            if (!window.location.hash.includes('/registry')) {
              // Navigate to registry, then apply search once rendered
              RegistryView._filter.q = q;
              Router.go('/registry');
            } else {
              RegistryView.applySearch(q);
            }
          }
        }
        // Clear on Escape
        if (e.key === 'Escape') {
          searchEl.value = '';
          if (window.location.hash.includes('/registry')) {
            RegistryView.applySearch('');
          }
        }
      });

      // Live search while on registry
      searchEl.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const q = searchEl.value.trim();
          if (window.location.hash.includes('/registry')) {
            RegistryView.applySearch(q);
          } else if (q.length >= 2) {
            // Auto-navigate to registry and search
            RegistryView._filter.q = q;
            Router.go('/registry');
          }
        }, 350);
      });

      // Focus: hint text and shortcut
      searchEl.setAttribute('placeholder', 'Search skills… (⌘K)');
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          searchEl.focus();
          searchEl.select();
        }
      });
    }

    Router.init();
  },

  async refreshBadges() {
    try {
      const [skills, runs, findings] = await Promise.all([
        API.skills.list(),
        API.runs.list(),
        API.findings.list(),
      ]);

      const badgeSkills   = document.getElementById('badge-skills');
      const badgeRuns     = document.getElementById('badge-runs');
      const badgeFindings = document.getElementById('badge-findings');

      if (badgeSkills)   badgeSkills.textContent   = skills.length;
      if (badgeRuns)     badgeRuns.textContent      = runs.length;
      if (badgeFindings) {
        const openHigh = findings.filter(f => f.status === 'open' && f.risk === 'High').length;
        badgeFindings.textContent = openHigh || findings.filter(f => f.status === 'open').length;
      }
    } catch(_) { /* badges are non-critical */ }
  },
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
