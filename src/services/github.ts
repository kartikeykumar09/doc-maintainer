
export interface FileNode {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
}

export interface RepoDetails {
    default_branch: string;
    description: string;
    topics: string[];
}

const BASE_URL = 'https://api.github.com';

export const parseRepoUrl = (url: string) => {
    try {
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
            return { owner: parts[0], repo: parts[1] };
        }
    } catch (e) {
        // Try parsing "owner/repo" string directly
        const parts = url.split('/');
        if (parts.length === 2) {
            return { owner: parts[0], repo: parts[1] };
        }
    }
    return null;
};

const handleResponse = async (response: Response, context: string) => {
    if (response.status === 403) {
        throw new Error(`GitHub Rate Limit Exceeded. Please add a Personal Access Token in Settings to continue.`);
    }
    if (response.status === 404) {
        throw new Error(`${context} not found. Check the URL or ensure you have access (Token required for private repos).`);
    }
    if (!response.ok) {
        throw new Error(`GitHub API Error (${response.status}): ${response.statusText}`);
    }
    return response;
};

export const getRepoDetails = async (owner: string, repo: string, token?: string): Promise<RepoDetails> => {
    const headers: HeadersInit = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}`, { headers });
    await handleResponse(response, 'Repository');
    return response.json();
};

export const getRepoTree = async (owner: string, repo: string, branch: string = 'main', token?: string): Promise<FileNode[]> => {
    const headers: HeadersInit = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    // Try fetching default branch first if 'main' fails? 
    // Ideally we should use the default_branch from repo details, which we do in App.tsx.

    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
    await handleResponse(response, 'File Tree');

    const data = await response.json();

    // Filter out non-code files (images, locks, etc)
    const ignoredExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.lock', '.tsbuildinfo', '.map'];
    const ignoredDirs = ['node_modules', 'dist', 'build', '.git', '.vscode', '.idea', 'coverage'];

    return data.tree.filter((node: FileNode) => {
        if (node.type !== 'blob') return false;
        const filename = node.path.split('/').pop() || '';
        if (filename.startsWith('.') && filename !== '.env.example') return false;
        if (ignoredExtensions.some(ext => filename.toLowerCase().endsWith(ext))) return false;
        if (ignoredDirs.some(dir => node.path.includes(`${dir}/`))) return false;
        return true;
    });
};

export const getFileContent = async (owner: string, repo: string, path: string, token?: string): Promise<string> => {
    const headers: HeadersInit = { 'Accept': 'application/vnd.github.v3.raw' };
    if (token) headers['Authorization'] = `token ${token}`;

    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/contents/${path}`, { headers });
    await handleResponse(response, `File ${path}`);
    return response.text();
};
