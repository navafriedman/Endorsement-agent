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

Create a questionnaire with this EXACT structure:

PAGE 1 - IDENTITY (category: "identity")
- Title: "Which of the following best describe you in [City]?"
- One MULTI_SELECT question with text "Select all that apply"
- Use these STANDARD options (same for all cities) with graphic (emoji) and label:
  { "graphic": "👨‍👩‍👧", "label": "I'm a parent or guardian" }
  { "graphic": "🏠", "label": "I'm a homeowner" }
  { "graphic": "🔑", "label": "I'm a renter" }
  { "graphic": "🏢", "label": "I'm a small business owner" }
  { "graphic": "👴", "label": "I'm a senior (65+)" }
  { "graphic": "🎖", "label": "I'm a veteran or military family" }
  { "graphic": "🎓", "label": "I'm a student" }
  { "graphic": "🚌", "label": "I use public transit" }
  { "graphic": "🌍", "label": "I'm an immigrant or from an immigrant family" }
  { "graphic": "🏥", "label": "I work in healthcare" }
  { "graphic": "📚", "label": "I work in education" }
  { "graphic": "🚒", "label": "I'm a first responder" }

PAGE 2 - IDEOLOGY (category: "ideology")
- Title: "How would you describe yourself politically?"
- TWO questions, both type "LIKERT" (not SINGLE_SELECT)
- Q1: graphic "💰", text "Economic Issues"
- Q2: graphic "🤝", text "Social Issues"
- Both use same 5-point scale: Progressive, "", Middle of the Road, "", Conservative

PAGE 3 - TOP ISSUES (category: "top_issues")
- Title: "What are the most important issues to you this election?"
- One MULTI_SELECT question
- 6-9 LOCALLY RELEVANT issues for the specific city
- Each option has: graphic (emoji), label, and signal (format: ISSUE_TOPIC)
- BASE ISSUES ON CURRENT LOCAL NEWS, recent legislation, ballot measures, and community debates

PAGES 4+ - ISSUE PROBES (category: "issue_probe")
- One page for EACH Top Issues option
- visibilityConditions: [{ "requiredSignal": "ISSUE_XXX" }] matching the signal
- Title is the issue name
- One SINGLE_SELECT question about priorities within that issue
- EXACTLY 3 options per probe, each with graphic (emoji) and label
- Options should reflect CURRENT local debates and perspectives on that issue

CRITICAL RULES:
1. Identity page uses the EXACT standard options shown above (same for all cities, just change city name in title)
2. Ideology page uses EXACTLY two LIKERT questions as shown (Economic Issues, Social Issues)
3. Top Issues should be HIGHLY LOCALLY RELEVANT - based on current news, recent legislation, ballot measures, and community debates in this specific city
4. Create one issue probe page for EACH Top Issues option with matching signal
5. Issue probes must have EXACTLY 3 options, each with a graphic (emoji) and label
6. All options throughout should reflect current local context and debates

Return ONLY valid JSON.`;

const DEFAULT_GENERATOR_USER_PROMPT = `Create a voter education questionnaire for {city}, {state} ({electionType}{electionDate}).

Based on your knowledge of {city}, {state}, create a questionnaire that reflects CURRENT local issues - recent news, laws passed or debated, ballot measures, community concerns, and ongoing local debates.

IMPORTANT - Follow the EXACT structure:
1. Identity page - use the STANDARD options from system prompt, just change "{city}" in the title
2. Ideology page - use EXACTLY the two LIKERT questions shown (Economic Issues, Social Issues)
3. Top Issues page - create 6-9 issues SPECIFIC to {city}, {state} based on current local news and debates, with emojis and signals
4+. Issue Probe pages - one per Top Issue, EXACTLY 3 options each with emojis, reflecting current local perspectives on that issue

Make this questionnaire feel relevant and timely for a {city} resident. Reference specific local context where possible (e.g., specific infrastructure projects, recent legislation, local ballot measures, neighborhood concerns).

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
