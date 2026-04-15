import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import QuestionsPage from './pages/QuestionsPage.jsx'
import QuestionBuilderPage from './pages/QuestionBuilderPage.jsx'

// Global style to enable simple light mode inversion and fix white borders
const style = document.createElement('style');
style.innerHTML = `
  :root {
    color-scheme: dark;
  }
  body {
    background-color: #020617; /* slate-950 */
    color: #cbd5e1; /* slate-300 */
    margin: 0;
  }
  /* Protect text-white from OS-level Light Mode overrides in index.css */
  .text-white {
    color: #ffffff !important;
  }
  .light-mode {
    color-scheme: light;
    filter: invert(1) hue-rotate(180deg);
  }
  .light-mode img, .light-mode video {
    filter: invert(1) hue-rotate(180deg);
  }
`;
document.head.appendChild(style);

function ThemeToggle() {
  const [isLight, setIsLight] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'light';
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  });

  // Auto-sync with OS changes if user hasn't manually overridden
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (e) => {
      if (!localStorage.getItem('theme_override')) {
        setIsLight(e.matches);
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (isLight) {
      document.documentElement.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    }
  }, [isLight]);

  const toggleTheme = () => {
    const next = !isLight;
    setIsLight(next);
    localStorage.setItem('theme', next ? 'light' : 'dark');
    localStorage.setItem('theme_override', 'true');
  };

  return (
    <button onClick={toggleTheme} className="fixed bottom-5 right-5 z-50 w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xl rounded-full shadow-2xl transition-all" title="Toggle Light/Dark Mode">
      {isLight ? '🌙' : '☀️'}
    </button>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeToggle />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/builder" element={<QuestionBuilderPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
