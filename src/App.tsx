import React, { useState, useEffect } from 'react';
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
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  File,
  Download
} from 'lucide-react';
import { 
  generateDocs, 
  saveApiKey, 
  getApiKey, 
  getSelectedModel, 
  saveSelectedModel, 
  defaultModels,
  availableModels as staticModels,
  fetchGeminiModels,
  fetchOpenAIModels
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

// Render Mermaid diagrams via mermaid.live iframe (most reliable method)
const MermaidDiagram = ({ chart }: { chart: string }) => {
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Encode diagram for mermaid.live URL using pako compression
  // For view mode: https://mermaid.live/view#pako:...
  const encodeDiagram = (code: string) => {
    try {
      // Simple base64 for the state object
      const state = { code, mermaid: { theme: 'dark' }, autoSync: true, updateDiagram: true };
      return btoa(JSON.stringify(state));
    } catch {
      return btoa(code);
    }
  };

  const encodedState = encodeDiagram(chart);
  const viewUrl = `https://mermaid.live/view#base64:${encodedState}`;

  return (
    <div style={{
      margin: '1rem 0',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
      border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: '0.5rem',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 1rem',
        background: 'rgba(0,0,0,0.2)',
        borderBottom: '1px solid rgba(99,102,241,0.2)'
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
          📊 Mermaid Diagram
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowCode(!showCode)}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.7rem',
              cursor: 'pointer'
            }}
          >
            {showCode ? 'Hide Code' : 'Show Code'}
          </button>
          <a
            href={`https://mermaid.live/edit#base64:${encodedState}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.7rem',
              textDecoration: 'none'
            }}
          >
            Edit ↗
          </a>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? 'var(--success)' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              fontSize: '0.7rem',
              cursor: 'pointer'
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>
      
      {showCode && (
        <pre style={{
          margin: 0,
          padding: '1rem',
          overflow: 'auto',
          maxHeight: '200px',
          fontSize: '0.7rem',
          lineHeight: 1.4,
          color: '#94a3b8',
          background: 'rgba(0,0,0,0.3)',
          borderBottom: '1px solid rgba(99,102,241,0.2)'
        }}>
          <code>{chart}</code>
        </pre>
      )}
      
      <div style={{ background: '#1e1e1e', minHeight: '250px' }}>
        <iframe
          src={viewUrl}
          style={{
            width: '100%',
            height: '350px',
            border: 'none',
            background: '#1e1e1e'
          }}
          title="Mermaid Diagram"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
};

function App() {
  // --- State ---
  // Repo
  const [repoUrl, setRepoUrl] = useState('');
  const [repoDetails, setRepoDetails] = useState<any>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isLoadingRepo, setIsLoadingRepo] = useState(false);
  
  // Generation
  const [docContent, setDocContent] = useState<Record<string, string> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'readme' | 'api' | 'examples' | 'architecture' | 'update'>('readme');
  
  // UI & Settings
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // API Config
  const [availableModels, setAvailableModels] = useState<AIModel[]>(staticModels);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
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

  useEffect(() => {
    const fetchModels = async () => {
        const key = getApiKey(provider) || apiKey;
        if (!key) return;
        
        setIsLoadingModels(true);
        try {
            let fetched: AIModel[] = [];
            if (provider === 'gemini') {
                fetched = await fetchGeminiModels(key);
            } else {
                fetched = await fetchOpenAIModels(key);
            }
            
            if (fetched.length > 0) {
                 setAvailableModels(prev => {
                     const others = prev.filter(p => p.provider !== provider);
                     return [...others, ...fetched];
                 });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingModels(false);
        }
    };
    
    fetchModels();
  }, [provider, apiKey]);

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

  const toggleSelectAll = () => {
    if (fileTree.length === 0) return;
    if (selectedPaths.size === fileTree.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(fileTree.map(n => n.path)));
    }
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
        type: 'all',
        additionalContext: context
      });

      if (typeof result === 'string') {
          // Fallback
          setDocContent({ readme: result, api: result, examples: result, architecture: result, update: result });
      } else {
          setDocContent(result);
      }

    } catch (err: any) {
      console.error(err);
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
            <div className="panel-title" style={{gap: '0.75rem'}}>
               <div 
                  className={`checkbox ${selectedPaths.size === fileTree.length && fileTree.length > 0 ? 'checked' : ''}`}
                  onClick={toggleSelectAll}
                  style={{cursor: 'pointer'}}
                  title="Select All"
                >
                   {selectedPaths.size === fileTree.length && fileTree.length > 0 && <Check size={12} />}
                </div>
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
            
            {(() => {
              // Build folder tree structure
              const buildTree = () => {
                const tree: Record<string, { files: typeof fileTree; folders: Set<string> }> = { '': { files: [], folders: new Set() }};
                
                fileTree.forEach(node => {
                  const parts = node.path.split('/');
                  if (parts.length === 1) {
                    // Root-level file
                    tree[''].files.push(node);
                  } else {
                    // File in a folder
                    const folder = parts.slice(0, -1).join('/');
                    if (!tree[folder]) tree[folder] = { files: [], folders: new Set() };
                    tree[folder].files.push(node);
                    
                    // Register parent folders
                    let parentPath = '';
                    for (let i = 0; i < parts.length - 1; i++) {
                      const currentPath = parts.slice(0, i + 1).join('/');
                      if (!tree[parentPath]) tree[parentPath] = { files: [], folders: new Set() };
                      tree[parentPath].folders.add(currentPath);
                      parentPath = currentPath;
                      if (!tree[currentPath]) tree[currentPath] = { files: [], folders: new Set() };
                    }
                  }
                });
                return tree;
              };
              
              const tree = buildTree();
              const toggleFolder = (folder: string) => {
                setExpandedFolders(prev => {
                  const next = new Set(prev);
                  if (next.has(folder)) next.delete(folder);
                  else next.add(folder);
                  return next;
                });
              };
              
              const renderFolder = (folderPath: string, depth: number = 0): React.ReactNode[] => {
                const data = tree[folderPath];
                if (!data) return [];
                
                const items: React.ReactNode[] = [];
                
                // Helper to get all files under a folder recursively
                const getAllFilesInFolder = (folder: string): string[] => {
                  const result: string[] = [];
                  const folderData = tree[folder];
                  if (folderData) {
                    result.push(...folderData.files.map(f => f.path));
                    folderData.folders.forEach(sub => {
                      result.push(...getAllFilesInFolder(sub));
                    });
                  }
                  return result;
                };
                
                // Render subfolders first
                Array.from(data.folders).sort().forEach(subFolder => {
                  const folderName = subFolder.split('/').pop() || subFolder;
                  const isExpanded = expandedFolders.has(subFolder);
                  const folderFiles = getAllFilesInFolder(subFolder);
                  const allSelected = folderFiles.length > 0 && folderFiles.every(f => selectedPaths.has(f));
                  const someSelected = folderFiles.some(f => selectedPaths.has(f));
                  
                  const toggleFolderSelection = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    const next = new Set(selectedPaths);
                    if (allSelected) {
                      folderFiles.forEach(f => next.delete(f));
                    } else {
                      folderFiles.forEach(f => next.add(f));
                    }
                    setSelectedPaths(next);
                  };
                  
                  items.push(
                    <div 
                      key={subFolder} 
                      className="file-item folder"
                      style={{ paddingLeft: `${depth * 16 + 12}px` }}
                      onClick={() => toggleFolder(subFolder)}
                    >
                      <div 
                        className={`checkbox ${allSelected ? 'checked' : someSelected ? 'partial' : ''}`}
                        onClick={toggleFolderSelection}
                      >
                        {allSelected && <Check size={12} />}
                        {someSelected && !allSelected && <span style={{fontSize: '10px'}}>–</span>}
                      </div>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Folder size={14} style={{ color: 'var(--warning)' }} />
                      <span className="file-path">{folderName}</span>
                    </div>
                  );
                  
                  if (isExpanded) {
                    items.push(...renderFolder(subFolder, depth + 1));
                  }
                });
                
                // Render files
                data.files.forEach(node => {
                  const fileName = node.path.split('/').pop() || node.path;
                  items.push(
                    <div 
                      key={node.path} 
                      className={`file-item ${selectedPaths.has(node.path) ? 'selected' : ''}`}
                      style={{ paddingLeft: `${depth * 16 + 12}px` }}
                      onClick={() => toggleFileSelection(node.path)}
                    >
                      <div className={`checkbox ${selectedPaths.has(node.path) ? 'checked' : ''}`}>
                        {selectedPaths.has(node.path) && <Check size={12} />}
                      </div>
                      <File size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="file-path">{fileName}</span>
                      <span className="file-size">{(node.size ? (node.size/1024).toFixed(1) + 'kb' : '')}</span>
                    </div>
                  );
                });
                
                return items;
              };
              
              return renderFolder('');
            })()}
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
              <button 
                className={`tab-btn ${activeTab === 'examples' ? 'active' : ''}`}
                onClick={() => setActiveTab('examples')}
              >
                Examples
              </button>
              <button 
                className={`tab-btn ${activeTab === 'update' ? 'active' : ''}`}
                onClick={() => setActiveTab('update')}
              >
                Update Docs
              </button>
              <button 
                className={`tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
                onClick={() => setActiveTab('architecture')}
              >
                Architecture
              </button>
            </div>
            
            <div className="panel-actions">
              <div style={{position: 'relative', marginRight: '0.5rem'}}>
                <button 
                  className="btn btn-secondary btn-sm"
                  style={{gap: '0.5rem', minWidth: '160px', justifyContent: 'space-between'}}
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                >
                   <span style={{maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {selectedModel.name.replace(/ \((Latest|Stable|001)\)/g, '')}
                   </span>
                   {isLoadingModels ? <RefreshCw size={14} className="spin" /> : <ChevronDown size={14} />}
                </button>
                {showModelDropdown && (
                   <div className="model-dropdown-menu" style={{
                      position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: '0.5rem', overflow: 'hidden', zIndex: 20,
                      minWidth: '220px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                   }}>
                      <div style={{padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)'}}>
                        Using {provider.charAt(0).toUpperCase() + provider.slice(1)}
                      </div>
                      {availableModels.filter(m => m.provider === provider).map(m => (
                         <button 
                           key={m.id} 
                           onClick={() => { setSelectedModel(m); setShowModelDropdown(false); }}
                           style={{
                             display: 'block', width: '100%', padding: '0.5rem 1rem',
                             textAlign: 'left', background: 'none', border: 'none',
                             color: 'var(--text)', cursor: 'pointer',
                             backgroundColor: selectedModel.id === m.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                             fontSize: '0.85rem'
                           }}
                           onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                           onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedModel.id === m.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent'}
                         >
                            {m.name}
                         </button>
                      ))}
                      <div style={{height: 1, background: 'var(--border)', margin: '0'}} />
                      <button 
                        onClick={() => { setShowSettings(true); setShowModelDropdown(false); }}
                         style={{
                             display: 'flex', alignItems: 'center', gap: '0.5rem',
                             width: '100%', padding: '0.75rem 1rem',
                             textAlign: 'left', background: 'rgba(0,0,0,0.1)', border: 'none',
                             color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem'
                           }}
                           onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'}
                           onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                         <Settings size={12} /> Configure Provider...
                      </button>
                   </div>
                )}
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleGenerate}
                disabled={isGenerating || !repoDetails}
              >
                {isGenerating ? <RefreshCw size={14} className="spin" /> : <Wand2 size={14} />}
                Generate
              </button>
              {docContent && (
                <>
                  <button className="btn btn-secondary btn-icon" onClick={() => {
                     const content = docContent[activeTab] || '';
                     const blob = new Blob([content], { type: 'text/markdown' });
                     const url = URL.createObjectURL(blob);
                     const a = document.createElement('a');
                     a.href = url;
                     a.download = `${activeTab === 'readme' ? 'README' : activeTab}.md`;
                     a.click();
                     URL.revokeObjectURL(url);
                  }} title="Download MD">
                    <Download size={16} />
                  </button>
                  <button className="btn btn-secondary btn-icon" onClick={() => {
                     const content = docContent[activeTab] || '';
                     navigator.clipboard.writeText(content);
                     setCopied(true);
                     setTimeout(() => setCopied(false), 2000);
                  }} title="Copy to Clipboard">
                    {copied ? <CheckCircle2 size={16} color="var(--success)" /> : <Copy size={16} />}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="markdown-preview custom-scroll">
            {docContent ? (
               <ReactMarkdown
               components={{
                 code({node, inline, className, children, ...props}: any) {
                   const match = /language-(\w+)/.exec(className || '');
                   if (!inline && match && match[1] === 'mermaid') {
                     return <MermaidDiagram chart={String(children)} />;
                   }
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
                {docContent[activeTab] || ''}
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
          More tools at <a href="https://kartikeykumar.com/tools" target="_blank" rel="noopener noreferrer">kartikeykumar.com/tools</a>
        </p>
        <a href="https://github.com/kartikeykumar09/doc-maintainer" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
          View Source Code
        </a>
      </footer>
    </div>
  );
}

export default App;
