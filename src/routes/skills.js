const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../store/db');
const router = express.Router();

// GET /api/skills
router.get('/', (req, res) => {
  res.json(db.getSkills());
});

// GET /api/skills/:id
router.get('/:id', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json(skill);
});

// POST /api/skills — create new skill
router.post('/', (req, res) => {
  const body = req.body;
  const now = new Date().toISOString();
  const skill = {
    id: body.id || uuidv4(),
    name: body.name || 'New Skill',
    shortDescription: body.shortDescription || '',
    version: '0.1',
    status: 'draft',
    registryLevel: 'personal',
    qualityBadge: 'draft',
    runCount: 0,
    step1: body.step1 || {},
    step2: body.step2 || { fieldMappings: [], dedupKeys: ['invoice_id'], qualityGate: { maxNullRateBlocking: 0.10, maxDupRateBlocking: 0.05, minRowCount: 5 } },
    step3: body.step3 || { tests: [] },
    step4: body.step4 || { classificationRules: [], followUpPolicy: {}, recommendedActions: {} },
    meta: { createdBy: 'user', createdAt: now, lastModifiedAt: now, tags: [], category: body.category || '' },
    versions: [{ version: '0.1', date: now.slice(0, 10), author: 'user', changes: 'Initial version', outcomes: {} }],
  };
  db.upsertSkill(skill);
  res.status(201).json(skill);
});

// PUT /api/skills/:id — update skill
router.put('/:id', (req, res) => {
  const existing = db.getSkill(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Skill not found' });
  const updated = {
    ...existing,
    ...req.body,
    id: existing.id,
    meta: { ...existing.meta, lastModifiedAt: new Date().toISOString() },
  };
  db.upsertSkill(updated);
  res.json(updated);
});

// POST /api/skills/:id/promote — promote to master
router.post('/:id/promote', (req, res) => {
  const skill = db.getSkill(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const { rationale, approvedBy } = req.body;
  const now = new Date().toISOString();
  const [major, minor] = (skill.version || '1.0').split('.').map(Number);
  const newVersion = `${major + 1}.0`;
  skill.version = newVersion;
  skill.status = 'master';
  skill.versions.push({ version: newVersion, date: now.slice(0, 10), author: approvedBy || 'manager', changes: rationale || 'Promoted to master', outcomes: {}, promoted: true });
  skill.meta.lastModifiedAt = now;
  db.upsertSkill(skill);
  res.json(skill);
});

module.exports = router;
