import React, { useState } from 'react';
import { z } from 'zod';
import CitationCard from './components/CitationCard';
import MeshSuggester from './components/MeshSuggester';
import { getActiveLanguage } from './utils/languageDetection';

const searchSchema = z.object({
  query: z.string().min(1, "Please enter a search term"),
});

export default function PubmedSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const targetLanguage = getActiveLanguage();
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pubmed_search_history') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [results, setResults] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [allPmids, setAllPmids] = useState([]);
  const [maxResults] = useState(20);

  const totalPages = Math.ceil(allPmids.length / maxResults);

  const handleSelectMesh = (term) => {
    setSearchTerm(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return `"${term}"[MeSH Terms]`;
      if (trimmed.toLowerCase().includes(term.toLowerCase())) return prev;
      return `${trimmed} AND "${term}"[MeSH Terms]`;
    });
  };

  const handleClear = () => {
    setSearchTerm('');
    setResults(null);
    setTotalCount(0);
    setError(null);
    setAllPmids([]);
    setCurrentPage(1);
  };

  const handleBulkSave = async () => {
    if (!results || !Array.isArray(results)) return;
    
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/pubmed/bulk-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: results })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error saving articles');

      setSaveMessage(data.message);
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePageChange = async (newPage) => {
    if (newPage < 1 || newPage > totalPages || loading) return;
    
    setLoading(true);
    setError(null);
    const startIndex = (newPage - 1) * maxResults;
    const pagePmids = allPmids.slice(startIndex, startIndex + maxResults);

    try {
      const response = await fetch('/api/pubmed/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pmids: pagePmids
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Error fetching page');

      setResults(data.data || []);
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(null);
    setResults(null);
    setCurrentPage(1);
    setAllPmids([]);

    const validation = searchSchema.safeParse({ query: searchTerm });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      // Update history: Move recent search to front and limit to 10
      const filteredHistory = searchHistory.filter(h => h !== validation.data.query);
      const updatedHistory = [validation.data.query, ...filteredHistory].slice(0, 10);
      setSearchHistory(updatedHistory);
      localStorage.setItem('pubmed_search_history', JSON.stringify(updatedHistory));

      const response = await fetch('/api/pubmed/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: validation.data.query,
          maxResults: 100 // Fetch up to 100 PMIDs to allow for some pagination
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Error fetching data');
      }

      setResults(data.data || []);
      setTotalCount(data.totalCount || 0);
      setAllPmids(data.allPmids || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pubmed-search-container">
      <h2>NCBI PubMed Search</h2>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Enter biological terms or genes..."
          list="search-history"
          className="flex-grow"
        />
        <datalist id="search-history">
          {searchHistory.map((query, index) => (
            <option key={index} value={query} />
          ))}
        </datalist>
        <button 
          type="submit" 
          disabled={loading} 
          className="btn-primary notranslate"
        >
          <span>{loading ? 'Searching...' : 'Search'}</span>
        </button>
        <button 
          type="button" 
          onClick={handleClear} 
          className="btn-danger notranslate"
        >
          <span>Clear</span>
        </button>
      </form>

      <MeshSuggester 
        searchTerm={searchTerm} 
        onSelectMesh={handleSelectMesh} 
        onDateFilterApply={(newQuery) => setSearchTerm(newQuery)}
      />

      {error && <p className="error-text">{error}</p>}
      {saveMessage && <p className="success-text">{saveMessage}</p>}
      
      {results && (
        <div className="results" style={{ marginTop: '20px' }}>
          {Array.isArray(results) && results.length > 0 && (
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="notranslate" style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>
                <span>Showing {((currentPage - 1) * maxResults) + 1}-{Math.min(currentPage * maxResults, totalCount)} of {totalCount.toLocaleString()} results</span>
              </span>
              <button 
                onClick={handleBulkSave} 
                disabled={saving}
                className="btn-primary notranslate"
                style={{ padding: '8px 16px', fontWeight: '600' }}
              >
                <span>{saving ? 'Saving...' : '📂 Bulk Save Page to Server'}</span>
              </button>
            </div>
          )}

          {Array.isArray(results) ? (
            <div className="citation-grid" key={`grid-${targetLanguage}`}>
              {results.length > 0 ? (
                results.map((article, idx) => (
                  <CitationCard 
                    key={article.pmid || idx} 
                    article={article} 
                  />
                ))
              ) : (
                <p>No results found for your query.</p>
              )}
            </div>
          ) : (
            <div className="raw-results">
              <h3>Raw Results</h3>
              <pre>{JSON.stringify(results, null, 2)}</pre>
            </div>
          )}

          {/* Pagination Control - Placed immediately below the grid */}
          {totalPages > 1 && (
            <nav className="pagination-control notranslate" aria-label="Pagination Navigation">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                className="prev-button"
              >
                <span>Previous</span>
              </button>
              
              <span className="page-indicator">
                <span>Page {currentPage} of {totalPages.toLocaleString()}</span>
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
                className="next-button"
              >
                <span>Next</span>
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
