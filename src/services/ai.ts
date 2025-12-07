
export type AIProvider = 'openai' | 'gemini';

export interface AIModel {
    id: string;
    name: string;
    provider: AIProvider;
}

export const defaultModels: Record<AIProvider, AIModel> = {
    openai: { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    gemini: { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' }
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
interface GenerateOptions {
    code: string;
    type: 'readme' | 'api' | 'examples' | 'update';
    existingDocs?: string; // For update mode
    additionalContext?: string;
}

const SYSTEM_PROMPTS = {
    readme: `You are an expert technical writer and developer advocate. 
Your task is to analyze the provided source code and generate a comprehensive, professional README.md file.
The README should include:
- Title and One-line Description (with emojis)
- Features List
- Installation Instructions
- Basic Usage Examples
- Configuration Options (if any)
- Contributing Guidelines
- License info (if inferred)

Format the output in clean, standard Markdown. Use styling (bolding, code blocks) effectively.`,

    api: `You are a technical documentation specialist.
Your task is to extract a detailed API Reference from the provided source code.
For each exported class, function, or constant:
- Name and Signature
- Description
- Parameters (name, type, description)
- Return value (type, description)
- Example usage if complex

Format as a Markdown reference guide. Use tables for parameters where appropriate.`,

    examples: `You are a developer education specialist.
Your task is to generate practical, copy-pasteable code examples demonstrating how to use the provided library/code.
Focus on:
- Common use cases
- Edge cases
- Best practices
Provide brief explanations before each code block.`,

    update: `You are a documentation maintenance bot.
You will be given:
1. The New Code
2. The Existing Documentation
Your task is to REWRITE the documentation to match the new code.
- Remove references to deleted features.
- Update changed function signatures.
- Add documentation for new features.
- Keep the style and tone consistent with the existing docs.
Return the FULL updated markdown file.`
};

export const generateDocs = async (options: GenerateOptions): Promise<string> => {
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

    if (model.provider === 'openai') {
        return generateOpenAI(apiKey, model.id, systemPrompt, userPrompt);
    } else {
        return generateGemini(apiKey, model.id, systemPrompt, userPrompt);
    }
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
        throw new Error(error.error?.message || 'Failed to generate docs with Gemini');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
