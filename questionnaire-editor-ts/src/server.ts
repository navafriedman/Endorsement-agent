import express, { Request, Response } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Database setup
const dbPath = path.join(__dirname, '../data/questionnaires.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS questionnaires (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    state TEXT,
    city TEXT,
    region TEXT,
    election_date TEXT,
    primary_date TEXT,
    current_version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS questionnaire_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    questionnaire_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    content_json TEXT NOT NULL,
    change_summary TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE,
    UNIQUE(questionnaire_id, version_number)
  );

  CREATE TABLE IF NOT EXISTS change_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    questionnaire_id INTEGER NOT NULL,
    version_from INTEGER,
    version_to INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    change_summary TEXT,
    change_details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id) ON DELETE CASCADE
  );
`);

// Types
interface Questionnaire {
  id: number;
  name: string;
  description: string | null;
  state: string | null;
  city: string | null;
  region: string | null;
  election_date: string | null;
  primary_date: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface QuestionnaireContent {
  name: string;
  description?: string;
  races: Race[];
}

interface Race {
  name: string;
  position: string;
  race_type: string;
  year: number;
  state?: string;
  city?: string;
  district?: string;
  candidates: Candidate[];
  primary_date?: string;
  general_date?: string;
}

interface Candidate {
  name: string;
  party?: string;
  incumbent?: boolean;
}

// API Routes

// List all questionnaires
app.get('/api/questionnaires', (req: Request, res: Response) => {
  const { state, city, start_date, end_date } = req.query;

  let sql = 'SELECT * FROM questionnaires WHERE 1=1';
  const params: any[] = [];

  if (state) {
    sql += ' AND state = ?';
    params.push(state);
  }
  if (city) {
    sql += ' AND city LIKE ?';
    params.push(`%${city}%`);
  }
  if (start_date) {
    sql += ' AND primary_date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND primary_date <= ?';
    params.push(end_date);
  }

  sql += ' ORDER BY updated_at DESC';

  const questionnaires = db.prepare(sql).all(...params);
  res.json({ questionnaires, count: questionnaires.length });
});

// Create questionnaire
app.post('/api/questionnaires', (req: Request, res: Response) => {
  const { name, description, state, city, region, primary_date, content } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const questionnaireContent: QuestionnaireContent = content || { name, description: description || '', races: [] };

  // Auto-detect state/city from content
  let detectedState = state;
  let detectedCity = city;
  let detectedPrimaryDate = primary_date;

  if (questionnaireContent.races && questionnaireContent.races.length > 0) {
    const firstRace = questionnaireContent.races[0];
    detectedState = detectedState || firstRace.state;
    detectedCity = detectedCity || firstRace.city;
    detectedPrimaryDate = detectedPrimaryDate || firstRace.primary_date;
  }

  const insertQ = db.prepare(`
    INSERT INTO questionnaires (name, description, state, city, region, primary_date, current_version)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const result = insertQ.run(name, description || questionnaireContent.description || '', detectedState, detectedCity, region, detectedPrimaryDate);
  const questionnaireId = result.lastInsertRowid as number;

  // Create initial version
  const insertV = db.prepare(`
    INSERT INTO questionnaire_versions (questionnaire_id, version_number, content_json, change_summary)
    VALUES (?, 1, ?, 'Initial creation')
  `);
  insertV.run(questionnaireId, JSON.stringify(questionnaireContent, null, 2));

  // Log the change
  const insertC = db.prepare(`
    INSERT INTO change_logs (questionnaire_id, version_from, version_to, change_type, change_summary)
    VALUES (?, NULL, 1, 'create', 'Created questionnaire')
  `);
  insertC.run(questionnaireId);

  const questionnaire = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(questionnaireId);
  res.status(201).json({ questionnaire, content: questionnaireContent });
});

// Get questionnaire
app.get('/api/questionnaires/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const questionnaire = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(id) as Questionnaire | undefined;
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const version = db.prepare(
    'SELECT content_json FROM questionnaire_versions WHERE questionnaire_id = ? AND version_number = ?'
  ).get(id, questionnaire.current_version) as { content_json: string } | undefined;

  const content = version ? JSON.parse(version.content_json) : null;
  res.json({ questionnaire, content });
});

// Update questionnaire
app.put('/api/questionnaires/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { content, change_summary } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const questionnaire = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(id) as Questionnaire | undefined;
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const oldVersion = questionnaire.current_version;
  const newVersion = oldVersion + 1;

  // Get old content for diff
  const oldVersionData = db.prepare(
    'SELECT content_json FROM questionnaire_versions WHERE questionnaire_id = ? AND version_number = ?'
  ).get(id, oldVersion) as { content_json: string } | undefined;
  const oldContent = oldVersionData ? JSON.parse(oldVersionData.content_json) : null;

  // Calculate diff
  const diff = computeDiff(oldContent, content);

  // Create new version
  db.prepare(`
    INSERT INTO questionnaire_versions (questionnaire_id, version_number, content_json, change_summary)
    VALUES (?, ?, ?, ?)
  `).run(id, newVersion, JSON.stringify(content, null, 2), change_summary || 'Updated');

  // Update questionnaire metadata
  let detectedState = questionnaire.state;
  let detectedCity = questionnaire.city;
  let detectedPrimaryDate = questionnaire.primary_date;

  if (content.races && content.races.length > 0) {
    const firstRace = content.races[0];
    detectedState = firstRace.state || detectedState;
    detectedCity = firstRace.city || detectedCity;
    detectedPrimaryDate = firstRace.primary_date || detectedPrimaryDate;
  }

  db.prepare(`
    UPDATE questionnaires
    SET current_version = ?, name = ?, description = ?, state = ?, city = ?, primary_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newVersion, content.name || questionnaire.name, content.description || questionnaire.description, detectedState, detectedCity, detectedPrimaryDate, id);

  // Log the change
  db.prepare(`
    INSERT INTO change_logs (questionnaire_id, version_from, version_to, change_type, change_summary, change_details)
    VALUES (?, ?, ?, 'update', ?, ?)
  `).run(id, oldVersion, newVersion, change_summary || 'Updated', JSON.stringify(diff));

  const updated = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(id);
  res.json({ questionnaire: updated, content, version: { version_number: newVersion } });
});

// Delete questionnaire
app.delete('/api/questionnaires/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('DELETE FROM questionnaires WHERE id = ?').run(id);
  res.json({ message: 'Questionnaire deleted' });
});

// List versions
app.get('/api/questionnaires/:id/versions', (req: Request, res: Response) => {
  const { id } = req.params;

  const questionnaire = db.prepare('SELECT current_version FROM questionnaires WHERE id = ?').get(id) as { current_version: number } | undefined;
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const versions = db.prepare(`
    SELECT id, questionnaire_id, version_number, change_summary, created_at
    FROM questionnaire_versions
    WHERE questionnaire_id = ?
    ORDER BY version_number DESC
  `).all(id);

  res.json({ versions, current_version: questionnaire.current_version });
});

// Get specific version
app.get('/api/questionnaires/:id/versions/:versionNumber', (req: Request, res: Response) => {
  const { id, versionNumber } = req.params;

  const version = db.prepare(
    'SELECT * FROM questionnaire_versions WHERE questionnaire_id = ? AND version_number = ?'
  ).get(id, versionNumber) as { content_json: string; version_number: number; change_summary: string; created_at: string } | undefined;

  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }

  res.json({ version, content: JSON.parse(version.content_json) });
});

// Rollback to version
app.post('/api/questionnaires/:id/versions/:versionNumber/rollback', (req: Request, res: Response) => {
  const { id, versionNumber } = req.params;

  const questionnaire = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(id) as Questionnaire | undefined;
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const targetVersion = db.prepare(
    'SELECT content_json FROM questionnaire_versions WHERE questionnaire_id = ? AND version_number = ?'
  ).get(id, versionNumber) as { content_json: string } | undefined;

  if (!targetVersion) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const content = JSON.parse(targetVersion.content_json);
  const oldVersion = questionnaire.current_version;
  const newVersion = oldVersion + 1;

  // Create new version with old content
  db.prepare(`
    INSERT INTO questionnaire_versions (questionnaire_id, version_number, content_json, change_summary)
    VALUES (?, ?, ?, ?)
  `).run(id, newVersion, targetVersion.content_json, `Rollback to version ${versionNumber}`);

  // Update current version
  db.prepare('UPDATE questionnaires SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newVersion, id);

  // Log the change
  db.prepare(`
    INSERT INTO change_logs (questionnaire_id, version_from, version_to, change_type, change_summary)
    VALUES (?, ?, ?, 'rollback', ?)
  `).run(id, oldVersion, newVersion, `Rolled back to version ${versionNumber}`);

  const updated = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(id);
  res.json({ questionnaire: updated, content, version: { version_number: newVersion } });
});

// Get change history
app.get('/api/questionnaires/:id/changes', (req: Request, res: Response) => {
  const { id } = req.params;

  const changes = db.prepare(`
    SELECT * FROM change_logs
    WHERE questionnaire_id = ?
    ORDER BY created_at DESC
  `).all(id);

  res.json({ changes });
});

// Import questionnaire
app.post('/api/questionnaires/import', (req: Request, res: Response) => {
  const content = req.body;

  if (!content || !content.name) {
    return res.status(400).json({ error: 'Invalid JSON: must have a "name" field' });
  }

  // Reuse create logic
  req.body = { name: content.name, description: content.description, content };
  return (app._router.stack.find((r: any) => r.route?.path === '/api/questionnaires' && r.route?.methods?.post)?.route?.stack[0]?.handle as any)(req, res);
});

// Get unique states
app.get('/api/states', (_req: Request, res: Response) => {
  const states = db.prepare('SELECT DISTINCT state FROM questionnaires WHERE state IS NOT NULL').all() as { state: string }[];
  res.json({ states: states.map(s => s.state) });
});

// Compute diff between two content versions
function computeDiff(oldContent: QuestionnaireContent | null, newContent: QuestionnaireContent): object {
  const diff: any = {
    races_added: [],
    races_removed: [],
    races_modified: [],
    candidates_added: [],
    candidates_removed: []
  };

  if (!oldContent) return diff;

  const oldRaces = new Map(oldContent.races?.map(r => [r.name, r]) || []);
  const newRaces = new Map(newContent.races?.map(r => [r.name, r]) || []);

  // Find added races
  for (const [name] of newRaces) {
    if (!oldRaces.has(name)) {
      diff.races_added.push(name);
    }
  }

  // Find removed races
  for (const [name] of oldRaces) {
    if (!newRaces.has(name)) {
      diff.races_removed.push(name);
    }
  }

  // Find modified races and candidate changes
  for (const [name, newRace] of newRaces) {
    const oldRace = oldRaces.get(name);
    if (oldRace && JSON.stringify(oldRace) !== JSON.stringify(newRace)) {
      diff.races_modified.push(name);

      const oldCandidates = new Set(oldRace.candidates?.map(c => c.name) || []);
      const newCandidates = new Set(newRace.candidates?.map(c => c.name) || []);

      for (const cname of newCandidates) {
        if (!oldCandidates.has(cname)) {
          diff.candidates_added.push(`${cname} (${name})`);
        }
      }

      for (const cname of oldCandidates) {
        if (!newCandidates.has(cname)) {
          diff.candidates_removed.push(`${cname} (${name})`);
        }
      }
    }
  }

  return diff;
}

// Serve index.html for all other routes (SPA)
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
============================================================
  Election Questionnaire Editor
============================================================

  Server running at http://0.0.0.0:${PORT}

  Features:
    - Create and edit election questionnaires
    - Track changes with version control
    - Import/export JSON files
    - Filter by date and geographic area

============================================================
`);
});
