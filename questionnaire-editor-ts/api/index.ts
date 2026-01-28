import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// API Routes

// List all questionnaires
app.get('/api/questionnaires', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('questionnaires')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ questionnaires: data || [], count: data?.length || 0 });
  } catch (e: any) {
    console.error('List error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create questionnaire
app.post('/api/questionnaires', async (req: Request, res: Response) => {
  const { name, description, content } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const questionnaireContent = content || { name, description: description || '', pages: [] };
    const now = new Date().toISOString();

    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .insert({
        name,
        description: description || questionnaireContent.description || '',
        current_version: 1,
        page_count: questionnaireContent.pages?.length || 0,
        question_count: questionnaireContent.pages?.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0) || 0,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (qError) throw qError;

    // Create initial version
    const { error: vError } = await supabase
      .from('versions')
      .insert({
        questionnaire_id: questionnaire.id,
        version_number: 1,
        content_json: JSON.stringify(questionnaireContent, null, 2),
        change_summary: 'Initial creation',
        created_at: now
      });

    if (vError) throw vError;

    res.status(201).json({ questionnaire, content: questionnaireContent });
  } catch (e: any) {
    console.error('Create error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get questionnaire
app.get('/api/questionnaires/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  try {
    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .select('*')
      .eq('id', id)
      .single();

    if (qError) throw qError;
    if (!questionnaire) {
      return res.status(404).json({ error: 'Questionnaire not found' });
    }

    const { data: version, error: vError } = await supabase
      .from('versions')
      .select('*')
      .eq('questionnaire_id', id)
      .eq('version_number', questionnaire.current_version)
      .single();

    if (vError) throw vError;

    const content = version ? JSON.parse(version.content_json) : null;
    res.json({ questionnaire, content });
  } catch (e: any) {
    console.error('Get error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update questionnaire
app.put('/api/questionnaires/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { content, change_summary } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const { data: questionnaire, error: qGetError } = await supabase
      .from('questionnaires')
      .select('*')
      .eq('id', id)
      .single();

    if (qGetError) throw qGetError;
    if (!questionnaire) {
      return res.status(404).json({ error: 'Questionnaire not found' });
    }

    const newVersion = questionnaire.current_version + 1;
    const now = new Date().toISOString();

    // Create new version
    const { error: vError } = await supabase
      .from('versions')
      .insert({
        questionnaire_id: id,
        version_number: newVersion,
        content_json: JSON.stringify(content, null, 2),
        change_summary: change_summary || 'Updated',
        created_at: now
      });

    if (vError) throw vError;

    // Update questionnaire
    const { data: updated, error: qUpdateError } = await supabase
      .from('questionnaires')
      .update({
        current_version: newVersion,
        name: content.name || questionnaire.name,
        description: content.description || questionnaire.description,
        page_count: content.pages?.length || 0,
        question_count: content.pages?.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0) || 0,
        updated_at: now
      })
      .eq('id', id)
      .select()
      .single();

    if (qUpdateError) throw qUpdateError;

    res.json({ questionnaire: updated, content, version: { version_number: newVersion } });
  } catch (e: any) {
    console.error('Update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete questionnaire
app.delete('/api/questionnaires/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  try {
    // Delete versions first
    await supabase.from('versions').delete().eq('questionnaire_id', id);

    // Delete questionnaire
    const { error } = await supabase.from('questionnaires').delete().eq('id', id);
    if (error) throw error;

    res.json({ message: 'Questionnaire deleted' });
  } catch (e: any) {
    console.error('Delete error:', e);
    res.status(500).json({ error: e.message });
  }
});

// List versions
app.get('/api/questionnaires/:id/versions', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  try {
    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .select('current_version')
      .eq('id', id)
      .single();

    if (qError) throw qError;

    const { data: versions, error: vError } = await supabase
      .from('versions')
      .select('id, questionnaire_id, version_number, change_summary, created_at')
      .eq('questionnaire_id', id)
      .order('version_number', { ascending: false });

    if (vError) throw vError;

    res.json({ versions: versions || [], current_version: questionnaire?.current_version });
  } catch (e: any) {
    console.error('List versions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get specific version
app.get('/api/questionnaires/:id/versions/:versionNumber', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const versionNumber = parseInt(req.params.versionNumber);

  try {
    const { data: version, error } = await supabase
      .from('versions')
      .select('*')
      .eq('questionnaire_id', id)
      .eq('version_number', versionNumber)
      .single();

    if (error) throw error;
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({ version, content: JSON.parse(version.content_json) });
  } catch (e: any) {
    console.error('Get version error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Rollback to version
app.post('/api/questionnaires/:id/versions/:versionNumber/rollback', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const versionNumber = parseInt(req.params.versionNumber);

  try {
    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .select('*')
      .eq('id', id)
      .single();

    if (qError) throw qError;

    const { data: targetVersion, error: vError } = await supabase
      .from('versions')
      .select('*')
      .eq('questionnaire_id', id)
      .eq('version_number', versionNumber)
      .single();

    if (vError) throw vError;

    const content = JSON.parse(targetVersion.content_json);
    const newVersion = questionnaire.current_version + 1;
    const now = new Date().toISOString();

    // Create new version with old content
    await supabase.from('versions').insert({
      questionnaire_id: id,
      version_number: newVersion,
      content_json: targetVersion.content_json,
      change_summary: `Rollback to version ${versionNumber}`,
      created_at: now
    });

    // Update questionnaire
    const { data: updated, error: qUpdateError } = await supabase
      .from('questionnaires')
      .update({
        current_version: newVersion,
        updated_at: now
      })
      .eq('id', id)
      .select()
      .single();

    if (qUpdateError) throw qUpdateError;

    res.json({ questionnaire: updated, content, version: { version_number: newVersion } });
  } catch (e: any) {
    console.error('Rollback error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Import questionnaire
app.post('/api/questionnaires/import', async (req: Request, res: Response) => {
  const content = req.body;

  let name = content.name;
  if (!name && content.pages && content.pages.length > 0) {
    name = content.pages[0].title || 'Imported Questionnaire';
  }

  if (!name) {
    return res.status(400).json({ error: 'Invalid JSON: must have a "name" field or "pages" array' });
  }

  try {
    const now = new Date().toISOString();
    const fullContent = { name, ...content };

    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .insert({
        name,
        description: content.description || '',
        current_version: 1,
        page_count: content.pages?.length || 0,
        question_count: content.pages?.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0) || 0,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (qError) throw qError;

    const { error: vError } = await supabase
      .from('versions')
      .insert({
        questionnaire_id: questionnaire.id,
        version_number: 1,
        content_json: JSON.stringify(fullContent, null, 2),
        change_summary: 'Imported from JSON',
        created_at: now
      });

    if (vError) throw vError;

    res.status(201).json({ questionnaire, content: fullContent });
  } catch (e: any) {
    console.error('Import error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get unique states (for filtering)
app.get('/api/states', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('questionnaires')
      .select('state')
      .not('state', 'is', null);

    if (error) throw error;

    const states = [...new Set(data?.map(d => d.state).filter(Boolean))];
    res.json({ states });
  } catch (e: any) {
    console.error('States error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default app;
