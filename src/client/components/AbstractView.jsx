import React, { useRef, useState, useEffect } from 'react';
import { useNativeSpeech } from '../hooks/useNativeSpeech';
import { getActiveLanguage } from '../utils/languageDetection';
import VoiceSettings from '../components/VoiceSettings';

let globalActiveVoiceId = null;

const AbstractView = ({ article, onSave, saving }) => {
  const abstractText = article?.abstract || 'No abstract available.';
  const title = article?.title || 'Untitled';
  const pubmedId = article?.pmid;
  const contentRef = useRef(null);

  // 1. 3D viewer button instant mount (Read straight from the backend payload identifier to identify cards to render 3D viewer)
  const [hasStructure, setHasStructure] = useState(!!article?.is3DViewerEligible);

  // 2. Rehydrate 3D viewer buttons as necessary. 
  const [structureData, setStructureData] = useState(null);

  useEffect(() => {
    if (pubmedId && hasStructure && !structureData) {
      // Quietly ask the server if this record has actual validated 3D data structures
      fetch(`/api/structure/${pubmedId}`)
        .then(res => res.json())
        .then(result => {
          // If valid 3D assets are resolved, bind them silently to the viewer button state
          if (result.data && (result.data.url || (Array.isArray(result.data) && result.data.length > 0))) {
            setStructureData(result.data);
            setHasStructure(true);
          } else {
            // For records with missing or empty datasets drop the button out of view silently
            setHasStructure(false);
          }
        })
        .catch(() => setHasStructure(false));
    }
  }, [pubmedId, hasStructure, structureData]);

  const targetLanguage = getActiveLanguage();
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const { speak, stop, isSpeaking } = useNativeSpeech(targetLanguage);

  useEffect(() => {
    if (!isSpeaking && globalActiveVoiceId === pubmedId) {
      globalActiveVoiceId = null;
      window.dispatchEvent(new Event('abstract-speech-sync'));
    }
    const handleSync = () => setLocalIsSpeaking(globalActiveVoiceId === pubmedId);
    window.addEventListener('abstract-speech-sync', handleSync);
    return () => window.removeEventListener('abstract-speech-sync', handleSync);
  }, [isSpeaking, pubmedId]);

  const handleSpeak = () => {
    const textToRead = contentRef.current ? contentRef.current.innerText : abstractText;
    globalActiveVoiceId = pubmedId;
    window.dispatchEvent(new Event('abstract-speech-sync'));
    speak(textToRead);
  };

  const handleStop = () => {
    globalActiveVoiceId = null;
    window.dispatchEvent(new Event('abstract-speech-sync'));
    stop();
  };

  const handleLaunchViewer = () => {
    const activePayload = structureData || { pmid: pubmedId, source: "SWISS-MODEL-PENDING" };
    sessionStorage.setItem(`structure_${pubmedId}`, JSON.stringify(activePayload));
    window.open(`/viewer/${pubmedId}`, '_blank');
  };

  return (
    <section className="abstract-card">
      <div className="abstract-header notranslate">
        {title && <h2 className="abstract-title" key={`title-${targetLanguage}`}><span>{title}</span></h2>}
        <div className="speech-controls">
          {onSave && (
            <button className="speech-btn save" onClick={onSave} disabled={saving}>
              <span className="icon">💾</span> <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
          {!localIsSpeaking ? (
            <button className="speech-btn play" onClick={handleSpeak}>
              <span className="icon">▶</span> <span>Play ({targetLanguage.toUpperCase()})</span>
            </button>
          ) : (
            <button className="speech-btn stop" onClick={handleStop}>
              <span className="icon">■</span> <span>Stop</span>
            </button>
          )}
           {hasStructure && (
            <button className="speech-btn viewer" onClick={handleLaunchViewer}>
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