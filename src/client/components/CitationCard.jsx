import React, { useState } from 'react';
import Tooltip from './Tooltip';
import AbstractView from './AbstractView';
import { getActiveLanguage } from '../utils/languageDetection';
import VoiceSettings from './VoiceSettings';

export default function CitationCard({ article }) {
  const {
    pmid,
    title,
    authors,
    journal,
    pubDate,
    abstract
  } = article;

  const targetLanguage = getActiveLanguage();
  const pubmedUrl = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '#';
  
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Function to handle the server-side "Save" action
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/pubmed/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: [article] })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error saving article');

      setSaveMessage('Saved to Research Folder!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="citation-card" key={`card-${pmid || title}-${targetLanguage}`}>
      <h3>
        <Tooltip text="view full article at NIH">
          <a href={pubmedUrl} target="_blank" rel="noopener noreferrer">
            <span key={`title-${targetLanguage}`}>{title || 'Untitled Publication'}</span>
          </a>
        </Tooltip>
      </h3>
      
      <p className="authors">
        <strong className="notranslate">Authors:</strong> <span key={`authors-${targetLanguage}`}>{Array.isArray(authors) ? authors.join(', ') : (authors || 'N/A')}</span>
      </p>
      
      <p className="meta">
        <em key={`journal-${targetLanguage}`}>{journal || 'Unknown Journal'}</em> | <span key={`date-${targetLanguage}`}>{pubDate || 'Unknown Date'}</span> | <strong className="notranslate">PMID:</strong> <span className="notranslate">{pmid || 'N/A'}</span>
      </p>

      <div className="action-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} className="btn-save notranslate">
            <span>{saving ? '⏳ Saving...' : '💾 Save to Research Folder'}</span>
          </button>
          {saveMessage && <span className="success-text" style={{ fontSize: '0.8rem' }}>{saveMessage}</span>}
        </div>
        
        {abstract && (
          <details>
            <summary className="notranslate">View Abstract</summary>
            <div className="abstract-container">
              <AbstractView 
                article={article} 
                onSave={handleSave}
                saving={saving}
              />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
