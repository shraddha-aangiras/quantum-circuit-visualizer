import { StrictMode } from 'react'
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/questions" element={<QuestionsPage />} />
        <Route path="/builder" element={<QuestionBuilderPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
