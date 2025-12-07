
export type AIProvider = 'openai' | 'gemini';

export interface AIModel {
    id: string;
    name: string;
    provider: AIProvider;
}

export const availableModels: AIModel[] = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
    { id: 'gemini-1.5-flash-001', name: 'Gemini 1.5 Flash (001)', provider: 'gemini' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' },
    { id: 'gemini-1.5-pro-001', name: 'Gemini 1.5 Pro (001)', provider: 'gemini' },
    { id: 'gemini-pro', name: 'Gemini Pro 1.0', provider: 'gemini' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' }
];

export const defaultModels: Record<AIProvider, AIModel> = {
    openai: availableModels.find(m => m.id === 'gpt-4o')!,
    gemini: availableModels.find(m => m.id === 'gemini-1.5-flash')!
};

// API Key Management
export const getApiKey = (provider: AIProvider): string | null => {
    return localStorage.getItem(`doc_maintainer_${provider}_key`);
};

export const saveApiKey = (provider: AIProvider, key: string): void => {
    localStorage.setItem(`doc_maintainer_${provider}_key`, key);
};

export const clearApiKey = (provider: AIProvider): void => {
    localStorage.removeItem(`doc_maintainer_${provider}_key`);
};

export const getSelectedModel = (): AIModel => {
    const saved = localStorage.getItem('doc_maintainer_model');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Failed to parse saved model', e);
        }
    }
    return defaultModels.gemini;
};

export const saveSelectedModel = (model: AIModel): void => {
    localStorage.setItem('doc_maintainer_model', JSON.stringify(model));
};

// Generation Service
// Generation Service
interface GenerateOptions {
    code: string;
    type: 'readme' | 'api' | 'examples' | 'update' | 'all';
    existingDocs?: string; // For update mode
    additionalContext?: string;
}

const SYSTEM_PROMPTS = {
    readme: `You are an expert technical writer and developer advocate.
Your task is to analyze the provided source code and generate a compelling, professional **Project Overview (README.md)**.

**Required Sections:**
1.  **Header**: Project Title + One-line "Hook" description + Status Badges.
2.  **Introduction**: What problem does this solve? Why use it?
3.  **Key Features**: Bullet points of main capabilities.
4.  **Tech Stack**: List of core frameworks/libraries used.
5.  **Getting Started**:
    - Prerequisites
    - Installation (\`npm install\`, \`pip install\`, etc.)
    - Running specific commands
6.  **Project Structure**: ASCII tree of the main directories.
7.  **Contributing**: Brief guide or link.

**Tone**: Enthusiastic, clear, and professional. Use emojis to make it engaging.`,

    api: `You are a technical documentation specialist.
Your task is to analyze the provided source code and generate a comprehensive **API Reference Guide**.

**Instructions:**
1.  **Analyze Core Interface**: Identify all API endpoints (REST/HTTP), public class methods, or key exported functions.
2.  **Document Internals**: Identify critical "Internal Core Functions" that handle business logic (like encryption, automation steps) and document them in a separate section.
3.  **Strict Formatting**: You MUST follow the structure below exactly for each item.

**Format Template for Endpoints:**
### N. [Method] [Path]
**Signature:** \`[Function Signature]\`
**Description:** [Detailed explanation]
**Parameters:**
| Name | Type | Description |
| :--- | :--- | :--- |
| [name] | [type] | [text] |

**Return Value:**
| Type | Description |
| :--- | :--- |
| [type] | [text] |

**Example Usage (cURL):**
\`\`\`bash
[cURL command]
\`\`\`

**Format Template for Internal Functions:**
### \`[Function Name]\`
**Description:** [Text]
**Parameters:** [Table]
**Return Value:** [Table]

**Tone**: Precise, exhaustive, and developer-focused. Do not simplify types.`,

    examples: `You are a developer education specialist.
Your task is to generate practical **Usage Guides & Examples**.

**Structure:**
1.  **Common Use Cases**: "How to X" with code snippets.
2.  **Configuration**: Environment variables (.env) reference.
3.  **Error Handling**: Common errors and how to fix them.
4.  **Edge Cases**: How the system handles weird inputs.

Provide valid, copy-pasteable code blocks.`,

    update: `You are a documentation maintenance bot.
Your task is to update existing documentation to match new code changes.

1.  **Compare**: Check the New Code against the Old Docs.
2.  **Update**: Modify signatures, add new parameters, remove deleted features.
3.  **Preserve**: Keep the existing structure/intro if it's still valid.
4.  **Output**: Return the FULL updated markdown file.`,

    all: `You are a comprehensive documentation generator.
Your task is to analyze the source code and generate FOUR documents in a single JSON response.

**Output Format**:
Return a valid JSON object with these exact keys:
- "readme": Project Overview (Markdown)
- "api": Detailed Strict API Reference (Markdown)
- "examples": Usage Examples (Markdown)
- "update": Update Notes (Markdown)

**Instructions**:
- **readme**: Professional, emojis, structure.
- **api**: Strict tables, signatures, cURL examples as per standard API docs.
- **examples**: Practical code snippets.
- **update**: Brief summary of what is documented.

**IMPORTANT**: Return ONLY raw JSON. Do not wrap in markdown code blocks.`
};

export const generateDocs = async (options: GenerateOptions): Promise<string | any> => {
    const model = getSelectedModel();
    const apiKey = getApiKey(model.provider);

    if (!apiKey) {
        throw new Error(`Please configure your ${model.provider === 'openai' ? 'OpenAI' : 'Google Gemini'} API key in settings.`);
    }

    const systemPrompt = SYSTEM_PROMPTS[options.type];
    let userPrompt = `Here is the source code:\n\n\`\`\`\n${options.code}\n\`\`\``;

    if (options.type === 'update' && options.existingDocs) {
        userPrompt += `\n\nHere is the EXISTING documentation:\n\n\`\`\`markdown\n${options.existingDocs}\n\`\`\``;
    }

    if (options.additionalContext) {
        userPrompt += `\n\nAdditional Context/Instructions:\n${options.additionalContext}`;
    }

    let result = '';
    if (model.provider === 'openai') {
        result = await generateOpenAI(apiKey, model.id, systemPrompt, userPrompt);
    } else {
        result = await generateGemini(apiKey, model.id, systemPrompt, userPrompt);
    }

    if (options.type === 'all') {
        try {
            // Clean up code blocks if present
            const clean = result.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            return JSON.parse(clean);
        } catch (e) {
            console.error('Failed to parse JSON docs', e);
            return { readme: result, api: result, examples: result, update: result }; // Fallback
        }
    }

    return result;
};

// Provider Implementations
async function generateOpenAI(apiKey: string, modelId: string, system: string, user: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelId,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            temperature: 0.3 // Lower temp for factual docs
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to generate docs with OpenAI');
    }

    const data = await response.json();
    return data.choices[0].message.content || '';
}

async function generateGemini(apiKey: string, modelId: string, system: string, user: string): Promise<string> {
    // Gemini doesn't always support system instructions in the free tier endpoint the same way, 
    // but for 1.5 Pro we can use system_instruction or just prepend it.
    // We'll prepend for maximum compatibility across models.

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: `${system}\n\nTask:\n${user}` }]
            }],
            generationConfig: {
                temperature: 0.3
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || error.message || 'Failed to generate docs with Gemini');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}



// Fetch available models from OpenAI
export const fetchOpenAIModels = async (apiKey: string): Promise<AIModel[]> => {
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error('Failed to fetch OpenAI models');

        const data = await response.json();
        const chatModels = data.data
            .filter((m: { id: string }) =>
                m.id.includes('gpt-4') || m.id.includes('gpt-3.5')
            )
            .map((m: { id: string }) => ({
                id: m.id,
                name: m.id,
                provider: 'openai' as AIProvider
            }))
            .sort((a: AIModel, b: AIModel) => a.id.localeCompare(b.id));

        return chatModels.length > 0 ? chatModels : [];
    } catch (e) {
        console.warn('Failed to fetch OpenAI models', e);
        return [];
    }
};

// Fetch available models from Gemini
export const fetchGeminiModels = async (apiKey: string): Promise<AIModel[]> => {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (!response.ok) throw new Error('Failed to fetch Gemini models');

        const data = await response.json();
        const models = data.models
            ?.filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
                m.supportedGenerationMethods?.includes('generateContent') &&
                (m.name.includes('gemini'))
            )
            .map((m: { name: string; displayName: string }) => ({
                id: m.name.replace('models/', ''),
                name: m.displayName || m.name.replace('models/', ''),
                provider: 'gemini' as AIProvider
            }));

        return models || [];
    } catch (e) {
        console.warn('Failed to fetch Gemini models', e);
        return [];
    }
};
