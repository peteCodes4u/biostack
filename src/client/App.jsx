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

// 1. Extracted Toolbar to easily control when to show header inputs vs default titles
function HeaderControls({ show3dSearch, onToggle3d }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px' }}>
      <div className="header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
        {/* If the dashboard viewer pane is active, show the search target slot right here */}
        {show3dSearch ? (
          <div id="header-portal" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {/* The Portal target is now guaranteed to exist inside the rendering lifecycle */}
          </div>
        ) : (
          <>
            <h1>BioStack</h1>
            <Suspense fallback={<p>Checking system health...</p>}>
              <HealthStatus />
            </Suspense>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
            fontWeight: '500'
          }}
        >
          <span>{theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
        </button>
      </div>
    </header>
  );
}

function MainDashboard({ show3dSearch, onToggle3d }) {
  return (
    <main className="main-dashboard">
      <div className="voice-pane">
        <VoiceSettings initialOpen={false}/>
      </div>
      
      <div style={{ margin: '15px 0', textAlign: 'left' }}>
        {/* The Action Button inside the dashboard */}
        <button
          className="search-3d-global-btn"
          onClick={onToggle3d}
          style={{
            padding: '10px 18px',
            backgroundColor: show3dSearch ? '#dc2626' : '#7c3aed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          {show3dSearch ? '❌ Close 3D Viewer' : '🧬 Search 3D structures'}
        </button>

        {show3dSearch && (
          <div 
            className="inline-molstar-viewport"
            style={{
              marginTop: '16px',
              border: '1px solid var(--border-color, #e5e7eb)',
              borderRadius: '12px',
              height: '550px',
              overflow: 'hidden'
            }}
          >
            <MolstarViewer />
          </div>
        )}
      </div>

      <div className="search-pane">
        <PubmedSearch />
      </div>
    </main>
  );
}

function App() {
  // Lift visibility state up to the parent shell so header and dashboard stay synced
  const [show3dSearch, setShow3dSearch] = useState(false);

  return (
    <Router>
      <div className="app-container">
        
        {/* Pass the visibility state down so the header handles layout updates */}
        <HeaderControls show3dSearch={show3dSearch} onToggle3d={() => setShow3dSearch(!show3dSearch)} />

        <Routes>
          <Route path="/" element={
            <MainDashboard show3dSearch={show3dSearch} onToggle3d={() => setShow3dSearch(!show3dSearch)} />
          } />
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
