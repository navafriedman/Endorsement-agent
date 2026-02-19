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
    const includeArchived = req.query.includeArchived === 'true';

    let query = supabase
      .from('questionnaires')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!includeArchived) {
      // Filter out archived questionnaires (archived = false OR archived is null)
      query = query.neq('archived', true);
    }

    const { data, error } = await query;

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
        archived: false,
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

// Archive/unarchive questionnaire
app.patch('/api/questionnaires/:id/archive', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { archived } = req.body;

  try {
    const { data, error } = await supabase
      .from('questionnaires')
      .update({ archived: archived ?? true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ questionnaire: data });
  } catch (e: any) {
    console.error('Archive error:', e);
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
        archived: false,
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

// Settings API - Get all settings
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*');

    if (error) throw error;

    // Convert array to object
    const settings: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      settings[row.key] = row.value;
    });

    res.json({ settings });
  } catch (e: any) {
    console.error('Settings get error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Settings API - Update a setting
app.put('/api/settings/:key', async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;

  try {
    const { data, error } = await supabase
      .from('settings')
      .upsert({
        key,
        value: value || '',
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ setting: data });
  } catch (e: any) {
    console.error('Settings update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Helper function to get a setting with fallback
async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data?.value) return fallback;
    return data.value;
  } catch {
    return fallback;
  }
}

// Default prompts for AI Eval
const DEFAULT_EVAL_SYSTEM_PROMPT = `You are a civic education specialist reviewing voter onboarding questionnaires for a non-partisan voter education app.

Your task is to review this questionnaire and suggest improvements, with PRIMARY focus on CONTENT quality and SECONDARY focus on formatting:

CONTENT (Primary - 70% of suggestions):
1. Issue coverage - Are important local issues missing? Would voters expect to see certain topics?
2. Option completeness - Do response options cover the full range of perspectives voters might hold?
3. Probe depth - Do issue probe questions ask about the most meaningful aspects of each issue?
4. Local relevance - Is the content specific and relevant to this location, or too generic?
5. Balance - Are options presented in a balanced, non-leading way that respects diverse viewpoints?

FORMATTING (Secondary - 30% of suggestions):
6. Clarity - Is wording easy to understand?
7. Neutrality - Are questions free from leading language?

STRUCTURAL RULES:
- This survey uses conditional logic: "Top Issues" options have signals (e.g., ISSUE_HOUSING), and "Issue Probe" pages have visibilityConditions with requiredSignal
- When suggesting NEW issues, always include both: a new option for Top Issues AND a corresponding probe page
- Preserve signal naming convention: ISSUE_TOPIC_NAME

Respond with a JSON array of suggestions. Each suggestion MUST have:
- "type": one of "add_option", "add_question", "modify_question", "modify_option", "reword"
- "priority": "high", "medium", or "low"
- "title": short summary (max 50 chars)
- "description": what to change and why
- "rationale": how this helps voters make informed decisions
- "pageIndex": which page (0-indexed)
- "questionIndex": which question (0-indexed, if applicable)
- "optionIndex": which option (0-indexed, if applicable for modify_option)
- "suggestedContent": the specific change as an object:
  - For add_option: { "graphic": "emoji", "label": "...", "signal": "ISSUE_XXX" }
  - For add_question (probe page): { "title": "...", "category": "issue_probe", "visibilityConditions": [{"requiredSignal": "ISSUE_XXX"}], "questions": [...] }
  - For modify_question/reword: { "text": "improved text" }
  - For modify_option: { "label": "improved label" }

Only respond with valid JSON array, no other text.`;

const DEFAULT_EVAL_USER_PROMPT = `Review this voter education questionnaire and suggest improvements:

**Questionnaire:** {questionnaireName}

**Current Content:**
{content}

Provide 4-6 suggestions. Prioritize CONTENT improvements (missing issues, incomplete options, shallow probes) over formatting. Consider what local issues might be missing and whether the probe questions get at the heart of each issue.

Return JSON array only.`;

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

    // Get custom prompts or use defaults
    const systemPrompt = await getSetting('eval_system_prompt', DEFAULT_EVAL_SYSTEM_PROMPT);
    const userPromptTemplate = await getSetting('eval_user_prompt', DEFAULT_EVAL_USER_PROMPT);

    // Build the content JSON for the prompt
    const contentJson = JSON.stringify(content.pages.map((p: any, pi: number) => ({
      pageIndex: pi,
      title: p.title,
      category: p.category,
      visibilityConditions: p.visibilityConditions,
      questions: (p.questions || []).map((q: any, qi: number) => ({
        questionIndex: qi,
        type: q.type,
        text: q.text,
        options: (q.options || []).map((o: any, oi: number) => ({
          optionIndex: oi,
          label: o.label,
          signal: o.signal
        }))
      }))
    })), null, 2);

    // Replace placeholders in user prompt
    const userPrompt = userPromptTemplate
      .replace('{questionnaireName}', content.name)
      .replace('{content}', contentJson);

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

// Default prompts for AI Generator
const DEFAULT_GENERATOR_SYSTEM_PROMPT = `You are a civic education researcher creating onboarding questionnaires for a non-partisan voter education app.

You MUST follow this EXACT JSON schema. Every field shown is required.

SCHEMA RULES:
- category values are UPPERCASE: "IDENTITY", "IDEOLOGY", "TOP_ISSUES", "ISSUE_PROBE"
- Every page has: order, title, category, why_text, help_text, questions
- Every option has: label, value, graphic (emoji)
- Every question has: type, order, options, visibilityConditions ([] if none)
- Issue probe questions use type "DROPDOWN" (NOT "SINGLE_SELECT")
- Top Issues options also have a "signal" field

PAGE 1 - IDENTITY
{
  "order": 1,
  "title": "Which of the following best describe you in [City]?",
  "category": "IDENTITY",
  "why_text": "These roles affect how local policies impact you. We match you with candidates who address your priorities.",
  "help_text": "Select all that fit.",
  "questions": [{
    "type": "MULTI_SELECT",
    "order": 1,
    "minSelected": 1,
    "maxSelected": 12,
    "visibilityConditions": [],
    "options": [
      { "label": "I'm a parent or guardian", "value": "Parent", "graphic": "👨‍👩‍👧" },
      { "label": "I'm a homeowner", "value": "Homeowner", "graphic": "🏠" },
      { "label": "I'm a renter", "value": "Renter", "graphic": "🔑" },
      { "label": "I'm a small business owner", "value": "Small Business Owner", "graphic": "🏪" },
      { "label": "I'm a senior (65+)", "value": "Senior", "graphic": "👴" },
      { "label": "I'm a veteran or military family", "value": "Veteran", "graphic": "🎖️" },
      { "label": "I'm a student", "value": "Student", "graphic": "🎓" },
      { "label": "I use public transit", "value": "Transit User", "graphic": "🚌" },
      { "label": "I'm an immigrant or from an immigrant family", "value": "Immigrant", "graphic": "🌎" },
      { "label": "I work in healthcare", "value": "Healthcare Worker", "graphic": "⚕️" },
      { "label": "I work in education", "value": "Educator", "graphic": "📚" },
      { "label": "None of these", "value": "", "graphic": "🤷" }
    ]
  }]
}

PAGE 2 - IDEOLOGY
{
  "order": 2,
  "title": "How would you describe yourself politically?",
  "category": "IDEOLOGY",
  "why_text": "This helps us set context and highlight candidates who speak your language.",
  "help_text": "Move the sliders to indicate where you fall.",
  "questions": [
    {
      "type": "LIKERT", "text": "Economic Issues", "graphic": "💰", "order": 1,
      "visibilityConditions": [],
      "options": [
        { "label": "Progressive", "value": "1" },
        { "label": "", "value": "2" },
        { "label": "Middle of the Road", "value": "3" },
        { "label": "", "value": "4" },
        { "label": "Conservative", "value": "5" }
      ]
    },
    {
      "type": "LIKERT", "text": "Social Issues", "graphic": "🤝", "order": 2,
      "visibilityConditions": [],
      "options": [
        { "label": "Progressive", "value": "1" },
        { "label": "", "value": "2" },
        { "label": "Middle of the Road", "value": "3" },
        { "label": "", "value": "4" },
        { "label": "Conservative", "value": "5" }
      ]
    }
  ]
}

PAGE 3 - TOP ISSUES
{
  "order": 3,
  "title": "What are the most important issues to you this election?",
  "category": "TOP_ISSUES",
  "why_text": "We'll use your top issues to match you with candidates who share your priorities.",
  "help_text": "Select up to 3 issues.",
  "questions": [{
    "type": "MULTI_SELECT",
    "order": 1,
    "minSelected": 1,
    "maxSelected": 3,
    "visibilityConditions": [],
    "options": [
      { "label": "Property taxes and appraisals", "value": "Property taxes and appraisals", "signal": "ISSUE_PROPERTY_TAX", "graphic": "💰" },
      ... (6-9 locally relevant issues)
    ]
  }]
}

PAGES 4+ - ISSUE PROBES (one per Top Issue)
{
  "order": 4,
  "title": "[Specific policy question for this issue]",
  "category": "ISSUE_PROBE",
  "why_text": "[Why this issue matters locally and how we use the answer]",
  "help_text": "Select the option closest to your view.",
  "questions": [{
    "type": "DROPDOWN",
    "order": 1,
    "visibilityConditions": [{ "requiredSignal": "ISSUE_XXX" }],
    "options": [
      { "label": "[Option A]", "value": "[short value]", "graphic": "emoji" },
      { "label": "[Option B]", "value": "[short value]", "graphic": "emoji" },
      { "label": "[Option C]", "value": "[short value]", "graphic": "emoji" }
    ]
  }]
}

CRITICAL RULES:
1. Identity options are STANDARD - use exactly as shown above for all cities (just change city name in title)
2. Ideology questions are STANDARD - use exactly as shown (LIKERT type, two questions, values 1-5)
3. Top Issues: 6-9 issues, highly relevant to this specific city/election, each with a signal
4. Issue Probes: EXACTLY one per Top Issue, type DROPDOWN, EXACTLY 3 options, meaningful policy question
5. why_text should explain local relevance and how the answer helps match candidates
6. Probe titles should be specific policy questions, not generic (e.g. "How should [City] address housing affordability?" not just "Housing")
7. Return ONLY valid JSON`;

const DEFAULT_GENERATOR_USER_PROMPT = `Create a voter education questionnaire for {city}, {state} ({electionType}{electionDate}).

Research what's happening in {city}, {state} right now - recent news, legislation, ballot measures, community debates - and use that to make this feel locally relevant and timely.

Follow the EXACT schema from the system prompt:
1. IDENTITY page - use standard options exactly as shown (change "{city}" in title only)
2. IDEOLOGY page - use exactly as shown (two LIKERT questions, values 1-5)
3. TOP_ISSUES page - 6-9 issues specific to {city}, {state} with signals, maxSelected: 3
4+. ISSUE_PROBE pages - one per issue, type DROPDOWN, 3 options, specific policy question as title

Make probe questions and why_text feel grounded in {city} - reference local context, specific challenges, named projects or laws where relevant.

Return ONLY valid JSON.`;

// AI Generate - Create questionnaire content for voter education
app.post('/api/questionnaires/generate', async (req: Request, res: Response) => {
  const { city, state, electionDate, electionType } = req.body;
  const client = getAnthropic();

  if (!client) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  if (!city || !state) {
    return res.status(400).json({ error: 'City and state are required' });
  }

  try {
    // Get custom prompts or use defaults
    const systemPrompt = await getSetting('generator_system_prompt', DEFAULT_GENERATOR_SYSTEM_PROMPT);
    const userPromptTemplate = await getSetting('generator_user_prompt', DEFAULT_GENERATOR_USER_PROMPT);

    // Replace placeholders in user prompt
    const userPrompt = userPromptTemplate
      .replace(/{city}/g, city)
      .replace(/{state}/g, state)
      .replace(/{electionType}/g, electionType || 'Primary')
      .replace(/{electionDate}/g, electionDate ? ` on ${electionDate}` : '');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      system: systemPrompt
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse the JSON response
    let questionnaire;
    try {
      questionnaire = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questionnaire = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    res.json({ questionnaire });
  } catch (e: any) {
    console.error('Generate error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default app;
