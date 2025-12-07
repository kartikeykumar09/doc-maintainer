import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Suppress mermaid-related errors from third-party rendering
window.addEventListener('error', (e) => {
  if (e.message?.includes('mermaid') || e.message?.includes('Syntax error in text')) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
});

// Also catch unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message?.includes('mermaid')) {
    e.preventDefault();
  }
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
