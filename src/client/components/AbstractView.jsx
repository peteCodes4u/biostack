import React, { useRef, useState, useEffect } from 'react';
import { useNativeSpeech } from '../hooks/useNativeSpeech';
import { getActiveLanguage } from '../utils/languageDetection';
import VoiceSettings from '../components/VoiceSettings';

// A single source of truth shared by ALL instances of this component on the page
let globalActiveVoiceId = null;

/**
 * AbstractView provides a UI for reading scientific abstracts.
 * It integrates with the language detection utility to automatically 
 * match the system voice with the dashboard's current translation.
 * Now includes a conditional 3D Viewer launch button.
 */
const AbstractView = ({ article, onSave, saving }) => {
  const abstractText = article?.abstract || 'No abstract available.';
  const title = article?.title || 'Untitled';
  const pubmedId = article?.pmid;
  const contentRef = useRef(null);
  const [hasStructure, setHasStructure] = useState(false);
  const [structureData, setStructureData] = useState(null);

  // 1. Check for structural data availability ONLY when needed
  useEffect(() => {
    if (pubmedId) {
      // 0-2 seconds delay to assist with play/stop button synchronization system behavior with user experience.
      const staggeredDelay = Math.random() * 2000;
      const timer = setTimeout(() => {
        fetch(`/api/structure/${pubmedId}`)
          .then(res => res.json())
          .then(result => {
            if (result.data && (result.data.url || (Array.isArray(result.data) && result.data.length > 0))) {
              setHasStructure(true);
              setStructureData(result.data);
            } else {
              setHasStructure(false);
            }
          })
          .catch(() => setHasStructure(false));
      }, staggeredDelay);
      return () => clearTimeout(timer);
    }
  }, [pubmedId]);

  // 2. Get the current active language from the Google Translate cookie
  const targetLanguage = getActiveLanguage();

  // 3. Track button layouts using a reactive check against the shared variable
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const { speak, stop, isSpeaking } = useNativeSpeech(targetLanguage);

  // Listen for audio channel shifts across all expanded cards
  useEffect(() => {
    // If the browser audio track naturally finishes reading on its own, clear global tracking
    if (!isSpeaking && globalActiveVoiceId === pubmedId) {
      globalActiveVoiceId = null;
      window.dispatchEvent(new Event('abstract-speech-sync'));
    }

    const handleSync = () => {
      // If the global active ID matches this card, show STOP. If not, force back to PLAY.
      setLocalIsSpeaking(globalActiveVoiceId === pubmedId);
    };

    window.addEventListener('abstract-speech-sync', handleSync);
    return () => window.removeEventListener('abstract-speech-sync', handleSync);
  }, [isSpeaking, pubmedId]);

  const handleSpeak = () => {
    const textToRead = contentRef.current ? contentRef.current.innerText : abstractText;
    
    // 1. Synchronously claim the global audio channel across all cards
    globalActiveVoiceId = pubmedId;
    
    // 2. Notify all open instances to instantly re-evaluate their layouts
    window.dispatchEvent(new Event('abstract-speech-sync'));
    
    // 3. Execute the working speech engine
    speak(textToRead);
  };

  const handleStop = () => {
    globalActiveVoiceId = null;
    window.dispatchEvent(new Event('abstract-speech-sync'));
    stop();
  };

  const handleLaunchViewer = () => {
    if (structureData) {
      sessionStorage.setItem(`structure_${pubmedId}`, JSON.stringify(structureData));
    }
    window.open(`/viewer/${pubmedId}`, '_blank');
  };

  return (
    <section className="abstract-card">
      <div className="abstract-header notranslate">
        {title && (
          <h2 className="abstract-title" key={`title-${targetLanguage}`}>
            <span>{title}</span>
          </h2>
        )}
        <div className="speech-controls">
          {onSave && (
            <button
              className="speech-btn save"
              onClick={onSave}
              disabled={saving}
              aria-label="Save to Research Folder"
              title="Save to Research Folder"
            >
              <span className="icon">💾</span> <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
          {!localIsSpeaking ? (
            <button
              className="speech-btn play"
              onClick={handleSpeak}
              aria-label={`Read abstract in ${targetLanguage}`}
              title={`Read abstract in ${targetLanguage.toUpperCase()}`}
            >
              <span className="icon">▶</span> <span>Play ({targetLanguage.toUpperCase()})</span>
            </button>
          ) : (
            <button
              className="speech-btn stop"
              onClick={handleStop}
              aria-label="Stop reading"
            >
              <span className="icon">■</span> <span>Stop</span>
            </button>
          )}
           {hasStructure && (
            <button
              className="speech-btn viewer"
              onClick={handleLaunchViewer}
              aria-label="Launch 3D Viewer"
              title="Launch 3D Viewer"
            >
              <span className="icon">🧬</span> <span>3D Viewer</span>
            </button>
          )}
        </div>
      </div>
      <VoiceSettings initialOpen={false} />
      <div className="abstract-body" key={`body-${targetLanguage}`} ref={contentRef}>
        <p><span>{abstractText}</span></p>
      </div>

      <style>{`
        .abstract-card {
          background: var(--bg-secondary, #ffffff);
          color: var(--text-primary, #1a1a1a);
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          padding: 24px;
          margin: 16px 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transition: background 0.3s ease, border-color 0.3s ease;
          width: 100%;
          box-sizing: border-box;
          overflow-wrap: break-word;
        }

        .abstract-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          gap: 16px;
        }

        .abstract-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          line-height: 1.4;
          text-align: left;
        }

        .speech-controls {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 140px;
        }

        .speech-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s;
          white-space: nowrap;
          box-sizing: border-box;
          width: 100%;
        }

        .speech-btn.viewer {
          background-color: #7c3aed;
          color: white;
        }

        .speech-btn.play {
          background-color: #2563eb;
          color: white;
        }

        .speech-btn.save {
          background-color: #059669;
          color: white;
          
        }

        .speech-btn.stop {
          background-color: #dc2626;
          color: white;
        }

        .speech-btn:hover {
          opacity: 0.9;
        }

        .abstract-body {
          line-height: 1.6;
          font-size: 1rem;
          opacity: 0.9;
          white-space: pre-wrap;
          text-align: left;
        }

        .icon {
          font-size: 12px;
          display: inline-flex;
          align-items: center;
        }

        @media (max-width: 600px) {
          .abstract-card {
            padding: 16px;
          }

          .abstract-header {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }

          .speech-controls {
            flex-direction: row;
            flex-wrap: wrap;
            width: 100%;
            min-width: 0;
            gap: 8px;
          }

          .speech-btn {
            flex: 1 1 calc(50% - 4px);
            min-width: 120px;
          }
        }

        @media (max-width: 380px) {
          .speech-btn {
            flex: 1 1 100%;
          }
        }
      `}</style>
    </section>
  );
};

export default AbstractView;
