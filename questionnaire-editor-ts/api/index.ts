import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-memory storage for Vercel (serverless = no persistent filesystem)
let questionnaires: Map<number, any> = new Map();
let versions: Map<string, any> = new Map(); // key: `${qId}-${versionNum}`
let changeLogs: any[] = [];
let nextId = 1;

// Types
interface QuestionnaireContent {
  name: string;
  description?: string;
  races: any[];
}

// API Routes

// List all questionnaires
app.get('/api/questionnaires', (req: Request, res: Response) => {
  const { state, city } = req.query;
  let results = Array.from(questionnaires.values());

  if (state) {
    results = results.filter(q => q.state === state);
  }
  if (city) {
    results = results.filter(q => q.city?.toLowerCase().includes((city as string).toLowerCase()));
  }

  results.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  res.json({ questionnaires: results, count: results.length });
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

  const id = nextId++;
  const now = new Date().toISOString();

  const questionnaire = {
    id,
    name,
    description: description || questionnaireContent.description || '',
    state: detectedState,
    city: detectedCity,
    region,
    primary_date: detectedPrimaryDate,
    current_version: 1,
    created_at: now,
    updated_at: now
  };

  questionnaires.set(id, questionnaire);

  // Create initial version
  versions.set(`${id}-1`, {
    id: nextId++,
    questionnaire_id: id,
    version_number: 1,
    content_json: JSON.stringify(questionnaireContent, null, 2),
    change_summary: 'Initial creation',
    created_at: now
  });

  // Log the change
  changeLogs.push({
    id: nextId++,
    questionnaire_id: id,
    version_from: null,
    version_to: 1,
    change_type: 'create',
    change_summary: 'Created questionnaire',
    created_at: now
  });

  res.status(201).json({ questionnaire, content: questionnaireContent });
});

// Get questionnaire
app.get('/api/questionnaires/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const questionnaire = questionnaires.get(id);

  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const version = versions.get(`${id}-${questionnaire.current_version}`);
  const content = version ? JSON.parse(version.content_json) : null;

  res.json({ questionnaire, content });
});

// Update questionnaire
app.put('/api/questionnaires/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { content, change_summary } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const questionnaire = questionnaires.get(id);
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const oldVersion = questionnaire.current_version;
  const newVersion = oldVersion + 1;
  const now = new Date().toISOString();

  // Create new version
  versions.set(`${id}-${newVersion}`, {
    id: nextId++,
    questionnaire_id: id,
    version_number: newVersion,
    content_json: JSON.stringify(content, null, 2),
    change_summary: change_summary || 'Updated',
    created_at: now
  });

  // Update questionnaire
  questionnaire.current_version = newVersion;
  questionnaire.name = content.name || questionnaire.name;
  questionnaire.description = content.description || questionnaire.description;
  questionnaire.updated_at = now;

  if (content.races && content.races.length > 0) {
    const firstRace = content.races[0];
    questionnaire.state = firstRace.state || questionnaire.state;
    questionnaire.city = firstRace.city || questionnaire.city;
    questionnaire.primary_date = firstRace.primary_date || questionnaire.primary_date;
  }

  // Log the change
  changeLogs.push({
    id: nextId++,
    questionnaire_id: id,
    version_from: oldVersion,
    version_to: newVersion,
    change_type: 'update',
    change_summary: change_summary || 'Updated',
    created_at: now
  });

  res.json({ questionnaire, content, version: { version_number: newVersion } });
});

// Delete questionnaire
app.delete('/api/questionnaires/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  questionnaires.delete(id);
  res.json({ message: 'Questionnaire deleted' });
});

// List versions
app.get('/api/questionnaires/:id/versions', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const questionnaire = questionnaires.get(id);

  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const qVersions = Array.from(versions.entries())
    .filter(([key]) => key.startsWith(`${id}-`))
    .map(([, v]) => ({
      id: v.id,
      questionnaire_id: v.questionnaire_id,
      version_number: v.version_number,
      change_summary: v.change_summary,
      created_at: v.created_at
    }))
    .sort((a, b) => b.version_number - a.version_number);

  res.json({ versions: qVersions, current_version: questionnaire.current_version });
});

// Get specific version
app.get('/api/questionnaires/:id/versions/:versionNumber', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const versionNumber = parseInt(req.params.versionNumber);

  const version = versions.get(`${id}-${versionNumber}`);
  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }

  res.json({ version, content: JSON.parse(version.content_json) });
});

// Rollback to version
app.post('/api/questionnaires/:id/versions/:versionNumber/rollback', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const versionNumber = parseInt(req.params.versionNumber);

  const questionnaire = questionnaires.get(id);
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const targetVersion = versions.get(`${id}-${versionNumber}`);
  if (!targetVersion) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const content = JSON.parse(targetVersion.content_json);
  const oldVersion = questionnaire.current_version;
  const newVersion = oldVersion + 1;
  const now = new Date().toISOString();

  // Create new version with old content
  versions.set(`${id}-${newVersion}`, {
    id: nextId++,
    questionnaire_id: id,
    version_number: newVersion,
    content_json: targetVersion.content_json,
    change_summary: `Rollback to version ${versionNumber}`,
    created_at: now
  });

  questionnaire.current_version = newVersion;
  questionnaire.updated_at = now;

  // Log the change
  changeLogs.push({
    id: nextId++,
    questionnaire_id: id,
    version_from: oldVersion,
    version_to: newVersion,
    change_type: 'rollback',
    change_summary: `Rolled back to version ${versionNumber}`,
    created_at: now
  });

  res.json({ questionnaire, content, version: { version_number: newVersion } });
});

// Get change history
app.get('/api/questionnaires/:id/changes', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const changes = changeLogs
    .filter(c => c.questionnaire_id === id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json({ changes });
});

// Import questionnaire
app.post('/api/questionnaires/import', (req: Request, res: Response) => {
  const content = req.body;
  if (!content || !content.name) {
    return res.status(400).json({ error: 'Invalid JSON: must have a "name" field' });
  }

  // Create using same logic as POST /api/questionnaires
  const fakeReq = { body: { name: content.name, description: content.description, content } } as Request;
  return app._router.handle(
    Object.assign(fakeReq, { method: 'POST', url: '/api/questionnaires' }),
    res,
    () => {}
  );
});

// Get unique states
app.get('/api/states', (_req: Request, res: Response) => {
  const states = new Set<string>();
  questionnaires.forEach(q => {
    if (q.state) states.add(q.state);
  });
  res.json({ states: Array.from(states) });
});

export default app;
