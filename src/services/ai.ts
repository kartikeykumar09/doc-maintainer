
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
    type: 'readme' | 'api' | 'examples' | 'architecture' | 'update' | 'all' | 'hld' | 'lld' | 'technical-analysis';
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
Your task is to analyze the source code and generate EIGHT documents in a single JSON response.

**Output Format**:
Return a valid JSON object with these exact keys:
- "readme": Project Overview (Markdown)
- "api": API Reference (Markdown)
- "examples": Usage Examples (Markdown)
- "architecture": System Architecture with Mermaid diagrams
- "update": Update Notes (Markdown)
- "hld": High-Level Design Document
- "lld": Low-Level Design Document
- "technical-analysis": Technical Analysis Report

**Document Guidelines**:
- **readme**: Professional project overview with features, setup, usage
- **api**: Function/endpoint documentation with parameters and returns
- **examples**: Practical code examples
- **architecture**: Component diagrams with Mermaid flowcharts
- **update**: Brief changelog/update summary
- **hld**: Executive-level system overview, context diagrams, integration points
- **lld**: Detailed module breakdown, class diagrams, sequence flows
- **technical-analysis**: Code quality, security, performance, SWOT analysis

**CRITICAL MERMAID SYNTAX RULES**:
1. Node labels: Use square brackets \`A[Label]\` or curly braces \`B{Decision}\`
2. NEVER use parentheses () inside ANY label text - they break the parser!
3. Edge labels: Use \`|label|\` syntax, NOT \`-- label --\` syntax
4. Special characters to AVOID: ( ) " ' & < > / - |
5. Keep labels SHORT - under 15 characters!

**FORBIDDEN DIAGRAM TYPES - DO NOT USE**:
- NO \`c4context\`, \`c4container\`, \`c4component\` - C4 diagrams are NOT supported!
- NO \`person\`, \`system\`, \`externalSystem\` keywords
- NO \`actor\` or \`database\` keywords in sequence diagrams
- ONLY use: \`graph\`, \`flowchart\`, \`sequenceDiagram\`, \`classDiagram\`

**SEQUENCE DIAGRAM RULES**:
- Use ONLY \`participant\` keyword
- Keep participant aliases SHORT: \`participant U as User\`
- Use simple arrow syntax: \`U->>A: message\`

**Correct flowchart example** (use this instead of C4):
\`\`\`mermaid
graph LR
    U[Users] --> App[Application]
    App --> Auth[Auth Service]
    App --> DB[(Database)]
    App --> Storage[File Storage]
    App --> Email[Email Service]
\`\`\`

**Correct sequence example**:
\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant D as DB
    U->>A: Request
    A->>D: Query
    D-->>A: Data
    A-->>U: Response
\`\`\`

**IMPORTANT**: Return ONLY raw JSON. Do not wrap in markdown code blocks.`,

    architecture: `You are a system architect.
Your task is to analyze the source code and generate an **Architecture & Internals Guide**.

**Required Content**:
1.  **High-Level Design**: Explain how the components interact.
2.  **Data Flow**: How data moves from input to output.
3.  **Mermaid Diagrams**: Use \`\`\`mermaid code blocks for flowcharts.
4.  **Directory Structure**: Annotated explanation of key files.
5.  **Tech Decisions**: Why specific libraries/patterns were chosen.

**CRITICAL MERMAID SYNTAX RULES - MUST FOLLOW EXACTLY**:

1. **Node Syntax**:
   - Rectangle: \`A[Label Text]\`
   - Diamond/Decision: \`B{Question}\`
   - Round: \`C((Label))\`
   
2. **FORBIDDEN Characters Inside Labels**:
   - NEVER use parentheses \`()\` inside label text - they BREAK the parser!
   - NEVER use quotes \`" '\` inside labels
   - NEVER use ampersand \`&\` - use "and" instead
   - NEVER use angle brackets \`< >\`
   
3. **Edge Labels - Use Pipe Syntax ONLY**:
   - BAD: \`A -- Some Label --> B\` ❌ (BREAKS PARSER)
   - BAD: \`A --Some Label--> B\` ❌ (BREAKS PARSER)  
   - GOOD: \`A -->|Some Label| B\` ✓
   - GOOD: \`A --> B\` ✓ (no label)
   
4. **Replacement Rules**:
   - \`(LLM)\` → \`- LLM\` or \`/LLM\`
   - \`"text"\` → \`text\`
   - \`A & B\` → \`A and B\`

5. **PREVENT TEXT OVERLAP - CRITICAL**:
   - Keep ALL labels SHORT: maximum 20 characters
   - Use abbreviations: "User Interface" → "UI", "Application" → "App"
   - AVOID subgraph blocks - they cause overlap issues
   - For sequence diagrams, use short participant aliases: \`participant U as User\`
   - Split long labels into multiple lines using \`<br/>\` ONLY if needed
   - Prefer simple flat diagrams over nested structures

6. **Correct Flowchart Example**:
\`\`\`mermaid
graph TD
    A[UI - React] -->|Select| B{Mode}
    B -->|Quick| C[Static Flow]
    B -->|AI Chat| D[Chat UI]
    C --> E{Answers}
    E --> F[Calc Results]
    F --> G[Display]
    D --> H{Input}
    H --> I[API Layer]
    I -->|LLM Call| J[Parse JSON]
    J --> K[Render]
    K --> D
\`\`\`

7. **SEQUENCE DIAGRAM RULES - CRITICAL**:
   - Use ONLY \`participant\` keyword - NOT \`actor\` or \`database\`
   - Keep participant names SHORT: max 10 chars
   - Use short aliases: \`participant U as User\`
   - Avoid special characters like / - in names

**Correct Sequence Example**:
\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant D as DB
    U->>A: Request
    A->>D: Query
    D-->>A: Data
    A-->>U: Response
\`\`\`

**Tone**: Technical and structural.`,

    hld: `You are a senior solutions architect.
Your task is to analyze the source code and generate a **High-Level Design (HLD) Document**.

**Required Sections:**
1. **Executive Summary**: Brief overview of the system purpose and scope.
2. **System Context Diagram**: Mermaid diagram showing the system and its external interactions (users, third-party services, databases).
3. **Architecture Overview**: High-level description of the architecture pattern (MVC, microservices, etc.).
4. **Component Overview**: List major components/modules with one-line descriptions.
5. **Technology Stack**: Technologies used and why they were chosen.
6. **Data Flow Overview**: How data moves through the system at a high level.
7. **Integration Points**: External APIs, services, and dependencies.
8. **Security Considerations**: Authentication, authorization, data protection at high level.
9. **Scalability Considerations**: How the system can scale.

**Mermaid Diagram Requirements:**
- Use simple flowcharts with \`graph TD\` or \`graph LR\` ONLY
- **DO NOT USE C4 diagrams** (c4context, c4container, etc.) - they are NOT supported!
- **DO NOT USE** person, system, externalSystem keywords
- Keep labels short (under 15 characters)
- Use abbreviations: UI, API, DB, Auth, etc.
- NO subgraphs - they cause overlap issues
- For sequences: Use ONLY \`participant\` - NOT \`actor\` or \`database\`
- Avoid special characters in names: no ( ) / - " '

**Example HLD Diagram:**
\`\`\`mermaid
graph LR
    U[Users] --> FE[Frontend]
    FE --> API[API Gateway]
    API --> Auth[Auth Service]
    API --> Core[Core Service]
    Core --> DB[(Database)]
    Core --> Cache[(Redis)]
    Core --> Queue[Message Queue]
\`\`\`

**Tone**: Executive-level, strategic, focused on the big picture.`,

    lld: `You are a senior software engineer.
Your task is to analyze the source code and generate a **Low-Level Design (LLD) Document**.

**Required Sections:**
1. **Module Breakdown**: Detailed description of each module/component.
2. **Class/Function Diagrams**: Mermaid class diagrams or detailed flowcharts.
3. **Data Models**: Schema definitions, interfaces, types.
4. **API Contracts**: Detailed endpoint specifications with request/response formats.
5. **Algorithm Details**: Key algorithms and their complexity analysis.
6. **State Management**: How state is managed across the application.
7. **Error Handling**: Error handling patterns and strategies.
8. **Database Schema**: Tables, relationships, indexes.
9. **Sequence Diagrams**: Detailed interaction flows for critical operations.

**Mermaid Diagram Requirements for LLD:**
- For class diagrams use \`classDiagram\`
- For sequences use \`sequenceDiagram\`
- Keep all labels short (under 15 chars)
- Use abbreviations where possible
- **CRITICAL**: Use ONLY \`participant\` keyword - NOT \`actor\` or \`database\`
- Keep participant aliases SHORT: \`participant U as User\`
- Avoid special characters in names: no ( ) / - " '

**Example Class Diagram:**
\`\`\`mermaid
classDiagram
    class UserService {
        +getUser(id)
        +createUser(data)
        -validateEmail()
    }
    class AuthService {
        +login(creds)
        +logout()
        +refreshToken()
    }
    UserService --> AuthService
\`\`\`

**Example Sequence Diagram:**
\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant D as DB
    U->>A: POST /login
    A->>D: Query user
    D-->>A: User data
    A-->>U: JWT token
\`\`\`

**Tone**: Detailed, implementation-focused, developer-oriented.`,

    'technical-analysis': `You are a senior technical analyst and code reviewer.
Your task is to analyze the source code and generate a comprehensive **Technical Analysis Report**.

**Required Sections:**
1. **Code Quality Assessment**:
   - Code structure and organization
   - Naming conventions
   - Code complexity metrics (estimated)
   - Adherence to best practices

2. **Architecture Analysis**:
   - Design patterns identified
   - SOLID principles adherence
   - Separation of concerns
   - Coupling and cohesion analysis

3. **Performance Considerations**:
   - Potential bottlenecks
   - Memory usage patterns
   - Async/concurrent operations
   - Database query efficiency

4. **Security Analysis**:
   - Input validation
   - Authentication/Authorization implementation
   - Data sanitization
   - Potential vulnerabilities (OWASP Top 10)

5. **Maintainability Score**:
   - Code documentation coverage
   - Test coverage indicators
   - Dependency management
   - Technical debt indicators

6. **Recommendations**:
   - Critical issues to address
   - Suggested improvements
   - Refactoring opportunities
   - Performance optimizations

7. **SWOT Analysis**:
   - Strengths of the codebase
   - Weaknesses to address
   - Opportunities for improvement
   - Threats/Risks

**Output Format**: Use markdown with clear headers, bullet points, and code examples where relevant.
Include a summary rating (1-10) for each major category.

**Tone**: Objective, analytical, constructive. Focus on actionable insights.`
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
