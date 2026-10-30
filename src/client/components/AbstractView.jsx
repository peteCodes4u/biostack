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
    </section>
  );
};

export default AbstractView;
