const express = require('express');
const db = require('../store/db');
const router = express.Router();

// GET /api/findings
router.get('/', (req, res) => {
  const { runId, risk, status } = req.query;
  let findings = db.getFindings();
  if (runId)  findings = findings.filter(f => f.runId === runId);
  if (risk)   findings = findings.filter(f => f.risk === risk);
  if (status) findings = findings.filter(f => f.status === status);
  res.json(findings);
});

// GET /api/findings/:id
router.get('/:id', (req, res) => {
  const f = db.getFinding(req.params.id);
  if (!f) return res.status(404).json({ error: 'Finding not found' });
  res.json(f);
});

// PUT /api/findings/:id — update status or management response
router.put('/:id', (req, res) => {
  const f = db.getFinding(req.params.id);
  if (!f) return res.status(404).json({ error: 'Finding not found' });
  const updated = { ...f, ...req.body, id: f.id };
  db.upsertFinding(updated);
  res.json(updated);
});

module.exports = router;
