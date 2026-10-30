import React, { use, Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import PubmedSearch from './components/PubmedSearch';
import MolstarViewer from './components/MolstarViewer';
import VoiceSettings from './components/VoiceSettings';
import { useTheme } from './hooks/ThemeContext';

const healthPromise = fetch('/api/health').then(res => res.json());

function HealthStatus() {
  const data = use(healthPromise);
  return <p className="health-check">System Status: {data.status} (as of {new Date(data.timestamp).toLocaleTimeString()})</p>;
}

function HeaderControls({ show3dSearch, onToggle3d }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px' }}>
      <div className="header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
        {show3dSearch ? (
          /* Forces the portal mounting slot to stretch 100% across the top row block layout */
          <div id="header-portal" style={{ display: 'flex', width: '100%', flexDirection: 'row', alignItems: 'center' }} />
        ) : (
          <>
            <h1>BioStack</h1>
            <Suspense fallback={<p>Checking system health...</p>}>
              <HealthStatus />
            </Suspense>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={toggleTheme}
          className="theme-toggle-btn notranslate"
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          <span>{theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
        </button>
      </div>
    </header>
  );
}


function MainDashboard() {
  const [show3dSearch, setShow3dSearch] = useState(false);
  const [isReadyToRender, setIsReadyToRender] = useState(false);

  const handleToggleViewer = () => {
    if (!show3dSearch) {
      setShow3dSearch(true);
      setTimeout(() => {
        setIsReadyToRender(true);
      }, 50);
    } else {
      setIsReadyToRender(false);
      setShow3dSearch(false);
    }
  };

  return (
    <main className="main-dashboard">
      <div className="search-pane">
        <PubmedSearch />
      </div>
      <section className="main-addl-tools">
      <div className="voice-pane">
        <VoiceSettings initialOpen={false} />
      </div>

      <div className='search-3d-global' style={{ margin: '12px 0', textAlign: 'left' }}>
        <button
          className="search-3d-global-btn"
          onClick={handleToggleViewer}
        >
          <span>{show3dSearch ? '❌ Close 3D Search' : '🧬 Search 3D structures'}</span>
        </button>
        {show3dSearch && (
          <div
            className="inline-molstar-viewport"
          >
            {isReadyToRender ? (
              <MolstarViewer />
            ) : (
              <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>
                Initializing 3D Viewport...
              </div>
            )}
          </div>
        )}
      </div>
      </section>
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
