import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Anthropic client (lazy init)
let anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// Helper: Compute diff between old and new content
function computeChangeSummary(oldContent: any, newContent: any): string {
  const changes: string[] = [];

  const oldPages = oldContent?.pages || [];
  const newPages = newContent?.pages || [];

  // Count pages
  if (newPages.length > oldPages.length) {
    changes.push(`+${newPages.length - oldPages.length} page(s)`);
  } else if (newPages.length < oldPages.length) {
    changes.push(`-${oldPages.length - newPages.length} page(s)`);
  }

  // Count questions
  const oldQCount = oldPages.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0);
  const newQCount = newPages.reduce((acc: number, p: any) => acc + (p.questions?.length || 0), 0);

  if (newQCount > oldQCount) {
    changes.push(`+${newQCount - oldQCount} question(s)`);
  } else if (newQCount < oldQCount) {
    changes.push(`-${oldQCount - newQCount} question(s)`);
  }

  // Count options
  const countOptions = (pages: any[]) => pages.reduce((acc: number, p: any) =>
    acc + (p.questions || []).reduce((qacc: number, q: any) => qacc + (q.options?.length || 0), 0), 0);

  const oldOptCount = countOptions(oldPages);
  const newOptCount = countOptions(newPages);

  if (newOptCount > oldOptCount) {
    changes.push(`+${newOptCount - oldOptCount} option(s)`);
  } else if (newOptCount < oldOptCount) {
    changes.push(`-${oldOptCount - newOptCount} option(s)`);
  }

  // Check metadata changes
  if (oldContent?.name !== newContent?.name) {
    changes.push('renamed');
  }
  if (oldContent?.description !== newContent?.description) {
    changes.push('updated description');
  }

  return changes.length > 0 ? changes.join(', ') : 'minor changes';
}

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

    // Get old content for diff
    const { data: oldVersion } = await supabase
      .from('versions')
      .select('content_json')
      .eq('questionnaire_id', id)
      .eq('version_number', questionnaire.current_version)
      .single();

    const oldContent = oldVersion ? JSON.parse(oldVersion.content_json) : null;
    const autoSummary = computeChangeSummary(oldContent, content);

    // Combine user summary with auto-generated summary
    const fullSummary = change_summary
      ? `${change_summary} (${autoSummary})`
      : autoSummary;

    const newVersion = questionnaire.current_version + 1;
    const now = new Date().toISOString();

    // Create new version
    const { error: vError } = await supabase
      .from('versions')
      .insert({
        questionnaire_id: id,
        version_number: newVersion,
        content_json: JSON.stringify(content, null, 2),
        change_summary: fullSummary,
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

// AI Eval - Analyze questionnaire and suggest improvements
app.post('/api/questionnaires/:id/eval', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const client = getAnthropic();

  if (!client) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Get questionnaire content
    const { data: questionnaire, error: qError } = await supabase
      .from('questionnaires')
      .select('*')
      .eq('id', id)
      .single();

    if (qError) throw qError;

    const { data: version, error: vError } = await supabase
      .from('versions')
      .select('content_json')
      .eq('questionnaire_id', id)
      .eq('version_number', questionnaire.current_version)
      .single();

    if (vError) throw vError;

    const content = JSON.parse(version.content_json);

    // Build the prompt
    const systemPrompt = `You are an expert elections analyst helping improve voter questionnaires for change.vote, a non-partisan voter guide platform.

Your task is to review election questionnaires and suggest improvements based on:
1. Current political issues and debates
2. Upcoming elections and races
3. Question clarity and bias-free wording
4. Missing important topics voters should consider
5. Outdated or incorrect information

Always be non-partisan and focus on helping voters make informed decisions.

CRITICAL STRUCTURAL RULE - Issue Pairing:
These questionnaires have a specific structure where "Top Issues" questions (asking which issues matter most to voters) are paired with "Issue Probe" questions (follow-up questions that dive deeper into specific issues). The pairing works via signals:
- Each option in a "Top Issues" question has a signal like "ISSUE_HOUSING" or "ISSUE_TAXES"
- Each "Issue Probe" question has a visibilityCondition with requiredSignal matching that signal
- This means the probe only shows if the user selected that issue as important

When suggesting changes:
- If you recommend adding a NEW ISSUE OPTION to a "Top Issues" question, you MUST also include a suggestion to add the corresponding "Issue Probe" question (with matching signal in visibilityConditions)
- If you recommend adding a NEW ISSUE PROBE question, you MUST also include a suggestion to add the corresponding option to the "Top Issues" question (with matching signal)
- Always pair these suggestions together - never suggest one without the other

Respond with a JSON array of suggestions. Each suggestion MUST have:
- "type": one of "add_question", "modify_question", "add_option", "modify_option", "remove", "reword"
- "priority": "high", "medium", or "low"
- "title": short summary (max 50 chars)
- "description": detailed explanation of the suggestion
- "rationale": why this change would help voters
- "pageIndex": which page this applies to (0-indexed, required for all except general suggestions)
- "questionIndex": which question this applies to (0-indexed, if applicable)
- "optionIndex": which option this applies to (0-indexed, if applicable for modify_option)
- "suggestedContent": REQUIRED - the specific content to apply. Must be an object with the exact fields to change:
  - For add_question: { "type": "SINGLE_SELECT", "text": "...", "options": [{"label": "...", "signal": "..."}], "visibilityConditions": [{"requiredSignal": "..."}] }
  - For modify_question: { "text": "new text" } (only fields to change)
  - For add_option: { "label": "...", "signal": "..." }
  - For modify_option: { "label": "new label" }
  - For reword: { "text": "reworded text" }
  - For remove: {} (empty object)

Only respond with valid JSON array, no other text.`;

    const userPrompt = `Please review this election questionnaire and provide suggestions for improvements:

**Questionnaire Name:** ${content.name}
**Description:** ${content.description || 'No description'}

**Current Content (with indices for reference):**
${JSON.stringify(content.pages.map((p: any, pi: number) => ({
  pageIndex: pi,
  title: p.title,
  category: p.category,
  visibilityConditions: p.visibilityConditions,
  questions: (p.questions || []).map((q: any, qi: number) => ({
    questionIndex: qi,
    type: q.type,
    text: q.text,
    visibilityConditions: q.visibilityConditions,
    options: (q.options || []).map((o: any, oi: number) => ({
      optionIndex: oi,
      label: o.label,
      signal: o.signal
    }))
  }))
})), null, 2)}

Based on current events and best practices for voter education, what improvements would you suggest? Consider:
- Are there important local/state/national issues missing?
- Are questions worded in a neutral, non-leading way?
- Are the response options comprehensive and balanced?
- Is anything potentially outdated?

Provide 3-7 actionable suggestions as a JSON array. IMPORTANT: Each suggestion must include "suggestedContent" with the specific change to apply.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      system: systemPrompt
    });

    // Parse the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Try to extract JSON from the response
    let suggestions = [];
    try {
      // Try direct parse first
      suggestions = JSON.parse(responseText);
    } catch {
      // Try to find JSON array in the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    }

    res.json({
      questionnaire_id: id,
      questionnaire_name: content.name,
      suggestions,
      generated_at: new Date().toISOString()
    });
  } catch (e: any) {
    console.error('Eval error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default app;
