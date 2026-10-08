import React, { use, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PubmedSearch from './PubmedSearch';
import MolstarViewer from './components/MolstarViewer';
import VoiceSettings from './components/VoiceSettings';
import { useTheme } from './hooks/ThemeContext';

// Demo of using a promise with React 19's 'use' hook
const healthPromise = fetch('/api/health').then(res => res.json());

function HealthStatus() {
  const data = use(healthPromise);
  return <p className="health-check">System Status: {data.status} (as of {new Date(data.timestamp).toLocaleTimeString()})</p>;
}

function MainDashboard() {
  return (
    <main className="main-dashboard">
      <div className="search-pane">
        <PubmedSearch />
      </div>
      <aside className="voice-pane">
        <VoiceSettings />
      </aside>
    </main>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Router>
      <div className="app-container">
        <header className="app-header">
          <div className="header-title-group">
            <h1>BioStack</h1>
            <Suspense fallback={<p>Checking system health...</p>}>
              <HealthStatus />
            </Suspense>
          </div>

          <button
            onClick={toggleTheme}
            className="theme-toggle-btn notranslate"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
          >
            <span>{theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
          </button>
        </header>

        <Routes>
          <Route path="/" element={<MainDashboard />} />
          <Route path="/viewer/:pubmedId" element={<MolstarViewer />} />
        </Routes>

        <footer>
          <p>&copy; 2026 BioStack Platform | Apple Silicon Optimized</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
