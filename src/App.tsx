import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Github, 
  FileCode, 
  Settings, 
  RefreshCw, 
  BookOpen, 
  Wand2, 
  MapPin, 
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { 
  generateDocs, 
  saveApiKey, 
  getApiKey, 
  getSelectedModel, 
  saveSelectedModel, 
  defaultModels,
  availableModels
} from './services/ai';
import type { AIModel, AIProvider } from './services/ai';
import { 
  parseRepoUrl, 
  getRepoDetails, 
  getRepoTree, 
  getFileContent
} from './services/github';
import type { FileNode } from './services/github';
import './index.css';

function App() {
  // --- State ---
  // Repo
  const [repoUrl, setRepoUrl] = useState('');
  const [repoDetails, setRepoDetails] = useState<any>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  
  // Generation
  const [docContent, setDocContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'readme' | 'api' | 'update'>('readme');
  
  // UI & Settings
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // API Config
  const [apiKey, setApiKeyState] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [selectedModel, setSelectedModel] = useState<AIModel>(defaultModels.gemini);

  // --- Effects ---
  useEffect(() => {
    const model = getSelectedModel();
    setProvider(model.provider);
    setSelectedModel(model);
    setApiKeyState(getApiKey(model.provider) || '');
    setGithubToken(localStorage.getItem('doc_maintainer_github_token') || '');
  }, []);

  // --- Handlers ---

  const handleSaveSettings = () => {
    if (apiKey) saveApiKey(provider, apiKey);
    if (githubToken) localStorage.setItem('doc_maintainer_github_token', githubToken);
    saveSelectedModel(selectedModel);
    setShowSettings(false);
    setError(null);
  };

  const handleLoadRepo = async () => {
    if (!repoUrl) return;
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      setError('Invalid GitHub URL. Format: github.com/owner/repo');
      return;
    }

    setIsLoadingRepo(true);
    setError(null);
    setFileTree([]);
    setSelectedPaths(new Set());
    setRepoDetails(null);

    try {
      const details = await getRepoDetails(parsed.owner, parsed.repo, githubToken);
      setRepoDetails(details);
      
      const tree = await getRepoTree(parsed.owner, parsed.repo, details.default_branch, githubToken);
      setFileTree(tree);
      
      // Auto-select likely candidates (package.json, pyproject.toml, index files)
      const likely = tree.filter(n => {
        const p = n.path.toLowerCase();
        return p.endsWith('package.json') || 
               p.endsWith('readme.md') ||
               p.endsWith('pyproject.toml') ||
               p === 'src/index.ts' ||
               p === 'src/main.ts' ||
               p === 'main.py';
      }).map(n => n.path);
      
      setSelectedPaths(new Set(likely));

    } catch (err: any) {
      if (err.message.includes('403') || err.message.includes('rate limit')) {
        setError('GitHub API rate limit exceeded. Please add a GitHub Token in settings.');
      } else {
        setError(err.message || 'Failed to load repository');
      }
    } finally {
      setIsLoadingRepo(false);
    }
  };

  const toggleFileSelection = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedPaths(next);
  };

  const handleGenerate = async () => {
    if (!repoDetails) return;
    if (selectedPaths.size === 0) {
      setError('Please select at least one file to analyze.');
      return;
    }
    if (!getApiKey(provider)) {
      setShowSettings(true);
      setError('Please configure your AI API key first.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Fetch content of all selected files
      // Note: In a real app we'd want to handle large files better or summarize them.
      const parsed = parseRepoUrl(repoUrl)!;
      const fileContents: string[] = [];
      
      let totalSize = 0;
      const MAX_SIZE = 100000; // ~100KB textual limit for safety (adjust based on model)

      for (const path of selectedPaths) {
        const content = await getFileContent(parsed.owner, parsed.repo, path, githubToken);
        fileContents.push(`File: ${path}\n\`\`\`\n${content}\n\`\`\``);
        
        totalSize += content.length;
        if (totalSize > MAX_SIZE) {
          // Warning or stop? standard models handle 128k-1M context, so this is very safe actually.
          // Gemini 1.5 Pro handles 1M tokens, so we can go much higher.
        }
      }

      const combinedCode = fileContents.join('\n\n');
      const context = `Repository: ${repoDetails.description || parsed.repo}\nContext Topics: ${repoDetails.topics?.join(', ')}`;

      // 2. Send to AI
      const result = await generateDocs({
        code: combinedCode,
        type: activeTab as any,
        additionalContext: context
      });

      setDocContent(result);

    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Render ---

  return (
    <div className="container">
      {/* Header */}
      <header className="header">
        <div className="header-badge">
          <BookOpen size={14} />
          <span>Public Preview</span>
        </div>
        <h1>AI Doc Maintainer</h1>
        <p>Connect a GitHub repository to automatically generate documentation.</p>
        
        <button 
          className="btn btn-secondary absolute-settings-btn"
          style={{ position: 'absolute', top: '2rem', right: '2rem' }}
          onClick={() => setShowSettings(true)}
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Repo Input Bar */}
      <div className="repo-bar">
        <div className="input-group">
          <Github className="input-icon" size={20} />
          <input 
            type="text" 
            placeholder="github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadRepo()}
          />
        </div>
        <button 
          className="btn btn-primary"
          onClick={handleLoadRepo}
          disabled={isLoadingRepo || !repoUrl}
        >
          {isLoadingRepo ? <RefreshCw className="spin" size={18} /> : 'Load Repo'}
        </button>
      </div>

      <div className="workspace">
        {/* Left: File Explorer */}
        <div className={`panel file-explorer ${!repoDetails ? 'disabled' : ''}`}>
          <div className="panel-header">
            <div className="panel-title">
              <FileCode size={18} className="text-secondary" />
              <span>Project Files</span>
            </div>
            <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
              {selectedPaths.size} selected
            </span>
          </div>
          
          <div className="file-list custom-scroll">
            {fileTree.length === 0 && !isLoadingRepo && (
              <div className="empty-state">
                <Search size={24} style={{opacity: 0.3, marginBottom: '0.5rem'}} />
                <span>Enter a repo URL to view files</span>
              </div>
            )}
            
            {fileTree.map(node => (
              <div 
                key={node.path} 
                className={`file-item ${selectedPaths.has(node.path) ? 'selected' : ''}`}
                onClick={() => toggleFileSelection(node.path)}
              >
                <div className={`checkbox ${selectedPaths.has(node.path) ? 'checked' : ''}`}>
                  {selectedPaths.has(node.path) && <Check size={12} />}
                </div>
                <span className="file-path">{node.path}</span>
                <span className="file-size">{(node.size ? (node.size/1024).toFixed(1) + 'kb' : '')}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Output */}
        <div className="panel output-panel">
          <div className="panel-header">
            <div className="panel-actions-left">
              <button 
                className={`tab-btn ${activeTab === 'readme' ? 'active' : ''}`}
                onClick={() => setActiveTab('readme')}
              >
                README
              </button>
              <button 
                className={`tab-btn ${activeTab === 'api' ? 'active' : ''}`}
                onClick={() => setActiveTab('api')}
              >
                API Reference
              </button>
            </div>
            
            <div className="panel-actions">
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleGenerate}
                disabled={isGenerating || !repoDetails}
              >
                {isGenerating ? <RefreshCw size={14} className="spin" /> : <Wand2 size={14} />}
                Generate
              </button>
              {docContent && (
                <button className="btn btn-secondary btn-icon" onClick={() => {
                   navigator.clipboard.writeText(docContent);
                   setCopied(true);
                   setTimeout(() => setCopied(false), 2000);
                }}>
                  {copied ? <CheckCircle2 size={16} color="var(--success)" /> : <Copy size={16} />}
                </button>
              )}
            </div>
          </div>

          <div className="markdown-preview custom-scroll">
            {docContent ? (
               <ReactMarkdown
               components={{
                 code({node, inline, className, children, ...props}: any) {
                   const match = /language-(\w+)/.exec(className || '');
                   return !inline && match ? (
                     <SyntaxHighlighter
                       style={vscDarkPlus}
                       language={match[1]}
                       PreTag="div"
                       {...props}
                     >
                       {String(children).replace(/\n$/, '')}
                     </SyntaxHighlighter>
                   ) : (
                     <code className={className} {...props}>
                       {children}
                     </code>
                   );
                 }
               }}
             >
               {docContent}
             </ReactMarkdown>
            ) : (
              <div className="placeholder-content">
                <MapPin size={48} style={{opacity: 0.2, marginBottom: '1rem'}} />
                <h3>Select files and generate docs</h3>
                <p>Select the core files of your project from the left panel to give the AI context.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="toast-error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Settings</h2>
              <button onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>AI Provider</label>
                <div className="btn-group">
                  {(['gemini', 'openai'] as const).map(p => (
                    <button
                      key={p}
                      className={provider === p ? 'active' : ''}
                      onClick={() => { setProvider(p); setSelectedModel(defaultModels[p]); setApiKeyState(getApiKey(p) || ''); }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Model</label>
                <select 
                  value={selectedModel.id} 
                  onChange={(e) => {
                    const m = availableModels.find(x => x.id === e.target.value);
                    if(m) setSelectedModel(m);
                  }}
                  style={{
                    width: '100%', padding: '0.75rem', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: '0.5rem',
                    color: 'var(--text)', fontFamily: 'Inter, sans-serif'
                  }}
                >
                  {availableModels.filter(m => m.provider === provider).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>AI API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKeyState(e.target.value)}
                  placeholder={`Enter ${provider} key`}
                />
              </div>

              <div className="form-group">
                <label>GitHub Personal Access Token (Optional)</label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                />
                <p className="help-text">Required for private repos or to increase rate limits.</p>
              </div>

              <button className="btn btn-primary full-width" onClick={handleSaveSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
      
       <footer className="footer">
        <p>
          Built by <a href="https://kartikeykumar.com" target="_blank" rel="noopener noreferrer">Kartikey Kumar</a> · 
          <a href="https://github.com/kartikeykumar09" target="_blank" rel="noopener noreferrer" style={{marginLeft: '0.3rem'}}>GitHub</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
