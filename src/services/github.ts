
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

export const getRepoDetails = async (owner: string, repo: string, token?: string): Promise<RepoDetails> => {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}`, { headers });
    if (!response.ok) throw new Error('Failed to fetch repo details');
    return response.json();
};

export const getRepoTree = async (owner: string, repo: string, branch: string = 'main', token?: string): Promise<FileNode[]> => {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    // Recursive tree fetch
    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
    if (!response.ok) throw new Error('Failed to fetch file tree');
    const data = await response.json();

    // Filter out non-code files (images, locks, etc) to reduce noise in this MVP
    const ignoredExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.lock', '.tsbuildinfo'];
    const ignoredDirs = ['node_modules', 'dist', 'build', '.git', '.vscode', '.idea'];

    return data.tree.filter((node: FileNode) => {
        if (node.type !== 'blob') return false; // Only files for now
        const filename = node.path.split('/').pop() || '';
        if (filename.startsWith('.')) return false; // Ignore dotfiles
        if (ignoredExtensions.some(ext => filename.toLowerCase().endsWith(ext))) return false;
        if (ignoredDirs.some(dir => node.path.includes(`${dir}/`))) return false;
        return true;
    });
};

export const getFileContent = async (owner: string, repo: string, path: string, token?: string): Promise<string> => {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3.raw', // Request raw content
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const response = await fetch(`${BASE_URL}/repos/${owner}/${repo}/contents/${path}`, { headers });

    if (!response.ok) throw new Error(`Failed to fetch file: ${path}`);
    return response.text();
};
