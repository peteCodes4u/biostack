import React, { useRef, useState, useEffect } from 'react';
import { useNativeSpeech } from '../hooks/useNativeSpeech';
import { getActiveLanguage } from '../utils/languageDetection';
import VoiceSettings from '../components/VoiceSettings';

/**
 * AbstractView provides a UI for reading scientific abstracts.
 * It integrates with the language detection utility to automatically 
 * match the system voice with the dashboard's current translation.
 * Now includes a conditional 3D Viewer launch button.
 */
const AbstractView = ({ article, onSave, saving }) => {
  // Use 'text' as the prop for the abstract content to match CitationCard's current usage
  const abstractText = article?.abstract || 'No abstract available.';
  const title = article?.title || 'Untitled';
  const pubmedId = article?.pmid;
  const contentRef = useRef(null);
  const [hasStructure, setHasStructure] = useState(false);
  const [structureData, setStructureData] = useState(null);

  // 1. Check for structural data availability ONLY when needed
  useEffect(() => {
    if (pubmedId) {
      const staggeredDelay = Math.random() * 2000; // 0-2 seconds delay
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
  
  // 3. Use the global speech hook with the target language code.
  const { speak, stop, isSpeaking } = useNativeSpeech(targetLanguage);

  const handleSpeak = () => {
    const textToRead = contentRef.current ? contentRef.current.innerText : abstractText;
    speak(textToRead);
  };

  const handleLaunchViewer = () => {
    // Optimization: Pass the already-fetched data to the new tab via sessionStorage
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
          {!isSpeaking ? (
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
              onClick={stop}
              aria-label="Stop reading"
            >
              <span className="icon">■</span> <span>Stop</span>
            </button>
          )}
        </div>
      </div>
      <VoiceSettings initialOpen={false}/>
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
          /* FIXED: Forces padding calculations to sit strictly inside width boundaries */
          width: 100%;
          box-sizing: border-box;
          overflow-wrap: break-word; /* Safeguards raw data strings from breaking layout bounds */
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
          width: 100%; /* Guarantees uniform button stretching in column layout fields */
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

        /* ==========================================================================
           RESPONSIVE MOBILE BREAKPOINTS
           ========================================================================== */
        @media (max-width: 600px) {
          .abstract-card {
            padding: 16px; /* Decreases heavy side gaps to optimize mobile workspace pixels */
          }

          .abstract-header {
            /* FIXED: Stacks the article title cleanly on top of the speech buttons */
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }

          .speech-controls {
            /* FIXED: Reconfigures controls from an rigid column stack into an adaptive row wrap grid */
            flex-direction: row;
            flex-wrap: wrap; /* Allows actions to wrap gracefully on smaller devices */
            width: 100%;
            min-width: 0;   /* Removes desktop-first rigid minimum bounds constraints */
            gap: 8px;
          }

          .speech-btn {
            /* Evenly spaces action components across dual rows when wrapped */
            flex: 1 1 calc(50% - 4px);
            min-width: 120px;
          }
        }

        @media (max-width: 380px) {
          .speech-btn {
            /* Forces single button blocks to stretch full wide on compact screens */
            flex: 1 1 100%;
          }
        }
      `}</style>
    </section>
  );
};

export default AbstractView;
