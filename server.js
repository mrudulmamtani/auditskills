/**
 * AuditSkills Platform — Express Server
 * npm start → http://localhost:3000
 */
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure data + uploads dirs exist
['data','uploads'].forEach(d => {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/skills',    require('./src/routes/skills'));
app.use('/api/runs',      require('./src/routes/runs'));
app.use('/api/findings',  require('./src/routes/findings'));
app.use('/api/generate',  require('./src/routes/generate'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Serve frontend ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — all non-API routes serve index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ⚡ AuditSkills Platform running at http://localhost:${PORT}\n`);
  console.log(`  Routes:`);
  console.log(`    GET  /                    → Web app`);
  console.log(`    GET  /api/skills          → List all skills`);
  console.log(`    POST /api/runs            → Start audit run (multipart: dataFile + skillId)`);
  console.log(`    GET  /api/runs/:id/export/excel  → Download working paper`);
  console.log(`    GET  /api/runs/:id/export/pdf    → Download findings report\n`);
});

module.exports = app;
