import express, { Request, Response } from 'express';
import cors from 'cors';
import { kv } from '@vercel/kv';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// KV Keys
const QUESTIONNAIRES_KEY = 'questionnaires';
const VERSIONS_PREFIX = 'version:';
const NEXT_ID_KEY = 'next_id';

// Helper functions for KV storage
async function getQuestionnaires(): Promise<Map<number, any>> {
  try {
    const data = await kv.get(QUESTIONNAIRES_KEY);
    if (data && typeof data === 'object') {
      return new Map(Object.entries(data).map(([k, v]) => [parseInt(k), v]));
    }
  } catch (e) {
    console.error('KV get error:', e);
  }
  return new Map();
}

async function saveQuestionnaires(questionnaires: Map<number, any>): Promise<void> {
  try {
    const obj = Object.fromEntries(questionnaires);
    await kv.set(QUESTIONNAIRES_KEY, obj);
  } catch (e) {
    console.error('KV set error:', e);
  }
}

async function getVersion(qId: number, versionNum: number): Promise<any> {
  try {
    return await kv.get(`${VERSIONS_PREFIX}${qId}-${versionNum}`);
  } catch (e) {
    console.error('KV get version error:', e);
    return null;
  }
}

async function saveVersion(qId: number, versionNum: number, version: any): Promise<void> {
  try {
    await kv.set(`${VERSIONS_PREFIX}${qId}-${versionNum}`, version);
  } catch (e) {
    console.error('KV set version error:', e);
  }
}

async function getNextId(): Promise<number> {
  try {
    const id = await kv.incr(NEXT_ID_KEY);
    return id;
  } catch (e) {
    console.error('KV incr error:', e);
    return Date.now(); // Fallback to timestamp
  }
}

async function getAllVersionsForQuestionnaire(qId: number, maxVersion: number): Promise<any[]> {
  const versions = [];
  for (let i = 1; i <= maxVersion; i++) {
    const v = await getVersion(qId, i);
    if (v) versions.push(v);
  }
  return versions;
}

// API Routes

// List all questionnaires
app.get('/api/questionnaires', async (req: Request, res: Response) => {
  const { state, city } = req.query;
  const questionnaires = await getQuestionnaires();
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
app.post('/api/questionnaires', async (req: Request, res: Response) => {
  const { name, description, state, city, region, primary_date, content } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const questionnaireContent = content || { name, description: description || '', pages: [] };
  const questionnaires = await getQuestionnaires();
  const id = await getNextId();
  const now = new Date().toISOString();

  const questionnaire = {
    id,
    name,
    description: description || questionnaireContent.description || '',
    state,
    city,
    region,
    primary_date,
    current_version: 1,
    created_at: now,
    updated_at: now,
    page_count: questionnaireContent.pages?.length || 0,
    question_count: questionnaireContent.pages?.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0) || 0
  };

  questionnaires.set(id, questionnaire);
  await saveQuestionnaires(questionnaires);

  // Create initial version
  await saveVersion(id, 1, {
    id: await getNextId(),
    questionnaire_id: id,
    version_number: 1,
    content_json: JSON.stringify(questionnaireContent, null, 2),
    change_summary: 'Initial creation',
    created_at: now
  });

  res.status(201).json({ questionnaire, content: questionnaireContent });
});

// Get questionnaire
app.get('/api/questionnaires/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const questionnaires = await getQuestionnaires();
  const questionnaire = questionnaires.get(id);

  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const version = await getVersion(id, questionnaire.current_version);
  const content = version ? JSON.parse(version.content_json) : null;

  res.json({ questionnaire, content });
});

// Update questionnaire
app.put('/api/questionnaires/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { content, change_summary } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const questionnaires = await getQuestionnaires();
  const questionnaire = questionnaires.get(id);
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const oldVersion = questionnaire.current_version;
  const newVersion = oldVersion + 1;
  const now = new Date().toISOString();

  // Create new version
  await saveVersion(id, newVersion, {
    id: await getNextId(),
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
  questionnaire.page_count = content.pages?.length || 0;
  questionnaire.question_count = content.pages?.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0) || 0;

  questionnaires.set(id, questionnaire);
  await saveQuestionnaires(questionnaires);

  res.json({ questionnaire, content, version: { version_number: newVersion } });
});

// Delete questionnaire
app.delete('/api/questionnaires/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const questionnaires = await getQuestionnaires();
  questionnaires.delete(id);
  await saveQuestionnaires(questionnaires);
  res.json({ message: 'Questionnaire deleted' });
});

// List versions
app.get('/api/questionnaires/:id/versions', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const questionnaires = await getQuestionnaires();
  const questionnaire = questionnaires.get(id);

  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const allVersions = await getAllVersionsForQuestionnaire(id, questionnaire.current_version);
  const qVersions = allVersions
    .map(v => ({
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
app.get('/api/questionnaires/:id/versions/:versionNumber', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const versionNumber = parseInt(req.params.versionNumber);

  const version = await getVersion(id, versionNumber);
  if (!version) {
    return res.status(404).json({ error: 'Version not found' });
  }

  res.json({ version, content: JSON.parse(version.content_json) });
});

// Rollback to version
app.post('/api/questionnaires/:id/versions/:versionNumber/rollback', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const versionNumber = parseInt(req.params.versionNumber);

  const questionnaires = await getQuestionnaires();
  const questionnaire = questionnaires.get(id);
  if (!questionnaire) {
    return res.status(404).json({ error: 'Questionnaire not found' });
  }

  const targetVersion = await getVersion(id, versionNumber);
  if (!targetVersion) {
    return res.status(404).json({ error: 'Version not found' });
  }

  const content = JSON.parse(targetVersion.content_json);
  const oldVersion = questionnaire.current_version;
  const newVersion = oldVersion + 1;
  const now = new Date().toISOString();

  // Create new version with old content
  await saveVersion(id, newVersion, {
    id: await getNextId(),
    questionnaire_id: id,
    version_number: newVersion,
    content_json: targetVersion.content_json,
    change_summary: `Rollback to version ${versionNumber}`,
    created_at: now
  });

  questionnaire.current_version = newVersion;
  questionnaire.updated_at = now;
  questionnaires.set(id, questionnaire);
  await saveQuestionnaires(questionnaires);

  res.json({ questionnaire, content, version: { version_number: newVersion } });
});

// Import questionnaire
app.post('/api/questionnaires/import', async (req: Request, res: Response) => {
  const content = req.body;

  // Support both formats:
  // 1. { "name": "...", "pages": [...] } - has explicit name
  // 2. { "pages": [...] } - derive name from first page title

  let name = content.name;

  if (!name && content.pages && content.pages.length > 0) {
    name = content.pages[0].title || 'Imported Questionnaire';
  }

  if (!name) {
    return res.status(400).json({ error: 'Invalid JSON: must have a "name" field or "pages" array' });
  }

  const questionnaires = await getQuestionnaires();
  const id = await getNextId();
  const now = new Date().toISOString();

  const questionnaire = {
    id,
    name,
    description: content.description || '',
    state: null,
    city: null,
    region: null,
    primary_date: null,
    current_version: 1,
    created_at: now,
    updated_at: now,
    page_count: content.pages?.length || 0,
    question_count: content.pages?.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0) || 0
  };

  questionnaires.set(id, questionnaire);
  await saveQuestionnaires(questionnaires);

  // Store full content including pages
  const fullContent = { name, ...content };

  await saveVersion(id, 1, {
    id: await getNextId(),
    questionnaire_id: id,
    version_number: 1,
    content_json: JSON.stringify(fullContent, null, 2),
    change_summary: 'Imported from JSON',
    created_at: now
  });

  res.status(201).json({ questionnaire, content: fullContent });
});

// Get unique states
app.get('/api/states', async (_req: Request, res: Response) => {
  const questionnaires = await getQuestionnaires();
  const states = new Set<string>();
  questionnaires.forEach(q => {
    if (q.state) states.add(q.state);
  });
  res.json({ states: Array.from(states) });
});

export default app;
