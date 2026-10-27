import React, { useState, useEffect } from 'react';
import { useNativeSpeech } from '../hooks/useNativeSpeech';
import { SUPPORTED_LANGUAGES } from '../languageSupport/SUPPORTED_LANGUAGES';
import './VoiceSettings.css';

/**
 * VoiceSettings provides a UI panel for configuring the browser's 
 * native speech synthesis and integrates Google Translate for 
 * dashboard-wide translation, maintaining the Biostack project aesthetic.
 */
const VoiceSettings = ({ initialOpen = false }) => {
  const { voices, selectedVoiceURI, setSelectedVoiceURI, speak } = useNativeSpeech();
  const [isTranslateDialogOpen, setIsTranslateDialogOpen] = useState(false);
  const [fromLang, setFromLang] = useState('en');
  const [toLang, setToLang] = useState('es');
  const [isPaneOpen, setIsPaneOpen] = useState(initialOpen);

  useEffect(() => {
    // 1. Programmatic Script Injection
    // Ensures Google's legacy library is available globally
    if (!document.getElementById('google-translate-script')) {
      const script = document.createElement('script');
      script.id = 'google-translate-script';
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.body.appendChild(script);

      window.googleTranslateElementInit = () => {
        if (window.google && window.google.translate) {
          new window.google.translate.TranslateElement({
            pageLanguage: 'en',
            layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
            autoDisplay: false,
          }, 'google_translate_element');
        }
      };
    }
  }, []);

  const handleVoiceChange = (e) => {
    setSelectedVoiceURI(e.target.value);
  };

  const handleTestVoice = () => {
    // Play an example to demonstrate the selected voice and accent
    speak("This is an example of the selected voice for the Biostack platform.");
  };

  const handleApplyTranslation = () => {
    // Google Translate looks for the 'googtrans' cookie
    // Format: /source_language/target_language
    const langValue = `/${fromLang}/${toLang}`;

    // Clear existing cookies to ensure the new selection takes priority
    const cookieBase = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    document.cookie = cookieBase;
    document.cookie = `${cookieBase} domain=.${window.location.hostname};`;

    // Set the new translation cookie
    document.cookie = `googtrans=${langValue}; path=/;`;
    document.cookie = `googtrans=${langValue}; domain=.${window.location.hostname}; path=/;`;

    // Reload is necessary for the Google script to re-parse the DOM
    window.location.reload();
  };

  const handleReset = () => {
    document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${window.location.hostname}; path=/;`;
    window.location.reload();
  };

  if (!isPaneOpen) {
    return (
      <div className="voice-pane-toggle-container">
        <button
          type="button"
          onClick={() => setIsPaneOpen(true)}
          className="voice-open-btn"
        >
          🔊 Show Voice & Translation Controls
        </button>
      </div>
    );
  }



  return (
  <section className="voice-settings-panel">
    <button 
      type="button" 
      onClick={() => setIsPaneOpen(false)} 
      className="voice-close-floating-btn"
      aria-label="Close voice settings panel"
      title="Close panel"
    >
      ✕
    </button>

    <h4 className="settings-header">Voice Settings</h4>
    <div className="voice-controls-container">
      <select 
        className="voice-selector"
        value={selectedVoiceURI} 
        onChange={handleVoiceChange}
        aria-label="Select TTS Voice"
      >
        {voices.length === 0 ? (
          <option>Loading voices...</option>
        ) : (
          voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))
        )}
      </select>
      
      <button 
        type="button"
        className="btn-play-example"
        onClick={handleTestVoice}
        disabled={!selectedVoiceURI}
      >
        Play Example
      </button>

      <div className="translation-section">
        <button 
          type="button"
          className="control-button primary" 
          onClick={() => setIsTranslateDialogOpen(true)}
        >
          Translate Dashboard
        </button>
        <button 
          type="button"
          className="control-button secondary" 
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </div>

    {/* Required hidden anchor for Google API */}
    <div id="google_translate_element" style={{ display: 'none' }}></div>

    {/* Modal Dialog */}
    {isTranslateDialogOpen && (
      <div className="modal-overlay" onClick={() => setIsTranslateDialogOpen(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title">Language Settings</h3>
          
          <div className="field-group">
            <label htmlFor="from-select">Translate From:</label>
            <select 
              id="from-select"
              value={fromLang} 
              onChange={(e) => setFromLang(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={`from-${lang.code}`} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="to-select">Translate To:</label>
            <select 
              id="to-select"
              value={toLang} 
              onChange={(e) => setToLang(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={`to-${lang.code}`} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-footer">
            <button className="btn-action apply" onClick={handleApplyTranslation}>
              Apply
            </button>
            <button className="btn-action cancel" onClick={() => setIsTranslateDialogOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
  </section>
);

};

export default VoiceSettings;
