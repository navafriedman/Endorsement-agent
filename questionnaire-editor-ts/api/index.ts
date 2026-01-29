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
    const systemPrompt = `You are a UX writing specialist who reviews survey forms for clarity and usability.

Your task is to review this survey and suggest improvements based on form design best practices:
1. Question clarity - Is the wording easy to understand? Free of jargon?
2. Neutral phrasing - Are questions free from leading or loaded language?
3. Response options - Are choices clear, balanced, and mutually exclusive?
4. Form flow - Is the structure logical? Are related items grouped?
5. Readability - Is language accessible to a general audience?

SCOPE: Focus ONLY on UX writing and form usability. Do NOT suggest new topics or content - only improve the clarity and structure of EXISTING content.

STRUCTURAL NOTE - Conditional Logic:
This survey uses conditional display logic. Some questions have a "visibilityCondition" with a "requiredSignal" that links to a "signal" on an option elsewhere. When suggesting rewording, preserve these signal values exactly.

Respond with a JSON array of suggestions. Each suggestion MUST have:
- "type": one of "modify_question", "modify_option", "reword"
- "priority": "high", "medium", or "low"
- "title": short summary (max 50 chars)
- "description": what to change and why
- "rationale": how this improves usability
- "pageIndex": which page (0-indexed)
- "questionIndex": which question (0-indexed, if applicable)
- "optionIndex": which option (0-indexed, if applicable)
- "suggestedContent": the specific change as an object:
  - For modify_question/reword: { "text": "improved text" }
  - For modify_option: { "label": "improved label" }

Only respond with valid JSON array, no other text.`;

    const userPrompt = `Review this survey form for UX writing improvements:

**Form Name:** ${content.name}

**Structure:**
${JSON.stringify(content.pages.map((p: any, pi: number) => ({
  pageIndex: pi,
  title: p.title,
  questions: (p.questions || []).map((q: any, qi: number) => ({
    questionIndex: qi,
    text: q.text,
    options: (q.options || []).map((o: any, oi: number) => ({
      optionIndex: oi,
      label: o.label
    }))
  }))
})), null, 2)}

Suggest 3-5 UX writing improvements. Focus on clarity, neutral phrasing, and readability. Return JSON array only.`;

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
    const systemPrompt = `You are a civic education researcher helping create onboarding questionnaires for a non-partisan voter education app.

Your task: Based on focused research from credible sources (local government websites, election offices, and local news outlets), create a set of onboarding questions that help voters in a specific location understand their priorities and find relevant information.

The questionnaire must follow this EXACT structure with these categories (pages):

1. IDENTITY - Questions about the voter's connection to their community (how long they've lived there, neighborhood, etc.)
2. IDEOLOGY - A standard political spectrum question (this should be the same regardless of location)
3. TOP ISSUES - What topics matter most to this voter (options should reflect locally-relevant issues for this specific geo)
4. ISSUE PROBES - Follow-up questions for each top issue (conditional on what issues they selected)

STRUCTURAL REQUIREMENTS:
- Each page has: title, category, order, questions array
- Each question has: type (SINGLE_SELECT or MULTI_SELECT), text, order, options array
- Each option has: label, signal (optional, used for conditional logic)
- Issue probe pages have visibilityConditions with requiredSignal matching the signal from Top Issues options

OUTPUT FORMAT - Return valid JSON only:
{
  "name": "City Name Election Type Questions",
  "description": "Voter onboarding for City, ST election",
  "pages": [
    {
      "title": "About You",
      "category": "identity",
      "order": 1,
      "questions": [...]
    },
    ...
  ]
}

Focus on creating questions that help voters reflect on what matters to THEM - not on pushing any particular viewpoint. The goal is voter empowerment through self-reflection.`;

    const userPrompt = `Create a voter education onboarding questionnaire for:

**Location:** ${city}, ${state}
**Election:** ${electionType || 'Primary'} ${electionDate ? `on ${electionDate}` : ''}

Based on research about this specific location, create questions that:
1. Help voters identify their connection to the community (identity)
2. Understand their general political orientation (ideology - use standard left/right spectrum)
3. Identify which local issues matter most to them (top issues - make these specific to ${city})
4. Dive deeper into their priorities on each issue (issue probes)

For the Top Issues, consider what's currently relevant in ${city}, ${state} - things like local infrastructure, housing, public safety, schools, economic development, etc. Make the options specific and locally relevant.

Return the complete questionnaire as valid JSON.`;

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
