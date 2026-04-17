/**
 * AuditSkills — API client
 * All fetch wrappers for the REST backend.
 */
const API = (() => {
  const BASE = '/api';

  async function req(method, path, body, isFormData) {
    const opts = { method };
    if (body && !isFormData) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    } else if (isFormData) {
      opts.body = body; // FormData — let browser set Content-Type
    }
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── Skills ──────────────────────────────────────────────────────────────
  return {
    skills: {
      list:    ()       => req('GET',  '/skills'),
      get:     (id)     => req('GET',  `/skills/${id}`),
      create:  (body)   => req('POST', '/skills', body),
      update:  (id, b)  => req('PUT',  `/skills/${id}`, b),
      promote: (id, b)  => req('POST', `/skills/${id}/promote`, b),
    },

    // ── Runs ──────────────────────────────────────────────────────────────
    runs: {
      list: ()   => req('GET', '/runs'),
      get:  (id) => req('GET', `/runs/${id}`),
      start: (skillId, runName, file) => {
        const fd = new FormData();
        fd.append('skillId', skillId);
        if (runName) fd.append('runName', runName);
        if (file)    fd.append('dataFile', file);
        return req('POST', '/runs', fd, true);
      },
      exportExcelUrl: (id) => `/api/runs/${id}/export/excel`,
      exportPdfUrl:   (id) => `/api/runs/${id}/export/pdf`,
    },

    // ── Findings ──────────────────────────────────────────────────────────
    findings: {
      list:   (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v));
        return req('GET', `/findings${qs.toString() ? '?' + qs : ''}`);
      },
      get:    (id)   => req('GET', `/findings/${id}`),
      update: (id,b) => req('PUT', `/findings/${id}`, b),
    },

    // ── Health ────────────────────────────────────────────────────────────
    health: () => req('GET', '/health'),
  };
})();
