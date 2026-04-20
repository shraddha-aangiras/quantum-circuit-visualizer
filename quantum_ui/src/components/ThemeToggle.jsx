import { useState, useEffect } from 'react';

export default function ThemeToggle() {
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
    <button onClick={toggleTheme} className="ml-auto w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm rounded-full transition-colors select-none" title="Toggle Light/Dark Mode">
      {isLight ? '🌙' : '☀️'}
    </button>
  );
}