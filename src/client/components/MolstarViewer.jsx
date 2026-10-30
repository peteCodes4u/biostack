import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { DefaultPluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { Plugin } from 'molstar/lib/mol-plugin-ui/plugin';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { resolveStructureUrl } from '../utils/structureResolver';
import { useTheme } from '../hooks/ThemeContext';
import 'molstar/build/viewer/molstar.css';
import './MolstarViewer.css';

/**
 * Full Mol* Viewer with UI Panels
 * Integrated as a native React component for React 19 compatibility.
 * Theme-aware background synchronization via PluginCommands.
 * UI Controls are portaled into the global application header.
 */
export default function MolstarViewer() {
  const { pubmedId, pmid } = useParams();
  const activeId = pubmedId || pmid; 
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [plugin, setPlugin] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [loading, setLoading] = useState(false);
  const [searchId, setSearchId] = useState('');

  // 1. Initialize Mol* UI Context
  useEffect(() => {
    let isMounted = true;
    const initPlugin = async () => {
      try {
        const spec = {
          ...DefaultPluginUISpec(),
          layout: {
            initial: {
              isExpanded: false,
              showControls: true,
              regionState: {
                bottom: 'full',
                left: 'full',
                right: 'full',
                top: 'full'
              }
            }
          },
          components: {
            remoteState: 'none'
          },
          config: [
            [PluginConfig.Viewport.ShowExpand, true],
            [PluginConfig.Viewport.ShowControls, true],
            [PluginConfig.Viewport.ShowSettings, true]
          ]
        };

        const ctx = new PluginUIContext(spec);
        await ctx.init();

        if (isMounted) {
          setPlugin(ctx);
        } else {
          ctx.dispose();
        }
      } catch (err) {
        console.error('Molstar UI context error:', err);
        if (isMounted) setStatus('Error: Failed to initialize viewer');
      }
    };

    initPlugin();

    return () => {
      isMounted = false;
      if (plugin) {
        plugin.dispose();
      }
    };
  }, []);

  // 1.1 Sync Background Color with Theme
  useEffect(() => {
    if (plugin) {
      const isDark = theme === 'dark';
      const bgColor = isDark ? Color(0x0f172a) : Color(0xffffff);
      
      PluginCommands.Canvas3D.SetSettings(plugin, {
        settings: props => {
          props.renderer.backgroundColor = bgColor;
        }
      });
    }
  }, [theme, plugin]);

  // 2. Load Logic
  const loadStructure = async (input) => {
    if (!plugin) return;

    if (!input || (typeof input === 'string' && !input.trim())) {
      setStatus('Ready');
      return;
    }

    setLoading(true);
    try {
      await plugin.clear();

      let targetStructure;
      if (typeof input === 'object' && input.url) {
        targetStructure = input;
        setStatus(`Loading pre-resolved ${targetStructure.source} structure...`);
      } else {
        const cleanInput = String(input).trim();
        setStatus(`Resolving structure for "${cleanInput}"...`);
        targetStructure = await resolveStructureUrl(cleanInput);
      }

      if (!targetStructure || !targetStructure.url) {
        setStatus(`Error: Could not retrieve any 3D structures.`);
        return;
      }

      const urlLower = targetStructure.url.toLowerCase();
      let format = 'mmcif';
      let isBinary = false;

      if (urlLower.includes('.bcif')) {
        format = 'cif';
        isBinary = true;
      } else if (urlLower.includes('.pdb')) {
        format = 'pdb';
      } else if (urlLower.includes('.cif')) {
        format = 'mmcif';
      } else if (targetStructure.source === 'SWISS-MODEL') {
        format = targetStructure.format || 'pdb';
      }

      const data = await plugin.builders.data.download({ 
        url: targetStructure.url, 
        isBinary: isBinary 
      });
      
      const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
      const model = await plugin.builders.structure.createModel(trajectory);
      const structure = await plugin.builders.structure.createStructure(model);

      await plugin.builders.structure.representation.applyPreset(structure, 'auto');
      
      setTimeout(() => {
        plugin.managers.camera.reset();
        plugin.canvas3d?.handleResize();
        plugin.canvas3d?.requestDraw();
      }, 150);
      
      setStatus(`Success: Loaded ${targetStructure.source}`);
    } catch (error) {
      console.error('Error loading structure:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. Automatic Load
  useEffect(() => {
    if (activeId && plugin) {
      const fetchFromPmid = async () => {
        const cachedData = sessionStorage.getItem(`structure_${activeId}`);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            await loadStructure(parsed);
            sessionStorage.removeItem(`structure_${activeId}`);
            return;
          } catch (e) {
            console.error("Failed to parse cached structure data:", e);
          }
        }

        setStatus(`Fetching structural data for PMID: ${activeId}...`);
        try {
          const response = await fetch(`/api/structure/${activeId}`);
          if (response.ok) {
            const result = await response.json();
            const data = result.data;
            if (data && data.url) {
               loadStructure(data);
            } else if (data && data.uniprot_id) {
               loadStructure(data.uniprot_id);
            } else if (Array.isArray(data) && data.length > 0) {
               loadStructure(data[0]); 
            } else {
              setStatus(`No structural data available for PMID: ${activeId}`);
            }
          } else {
            setStatus(`No structural data available for PMID: ${activeId}`);
          }
        } catch (error) {
          console.error('Error fetching structure for PMID:', error);
          setStatus('Error: Failed to fetch structure data');
        }
      };
      fetchFromPmid();
    }
  }, [activeId, plugin]);

  const handleReturn = () => {
    if (window.opener) {
      window.close();
    } else {
      navigate('/');
    }
  };

  // Add this small helper inside MolstarViewer to capture form submisson events gracefully
  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (searchId.trim() && !loading) {
      loadStructure(searchId);
    }
  };

  return (
    <section className="molstar-app-container">
      {createPortal(
        <div className="viewer-header-portal-content">
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <button 
              onClick={handleReturn}
              className="return-btn"
              title="Return to Search"
              style={{ 
                background: 'none', 
                border: 'none', 
                color: 'inherit', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '5px'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
            
            {/* 
              Form element wrapper ensures the search bar always mounts immediately.
              It binds the input to the state and captures Enter key triggers flawlessly.
            */}
            <form onSubmit={handleFormSubmit} className="search-bar" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="text" 
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="UniProt Accession (e.g., O88844, P04637)"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  background: 'var(--bg-primary, #ffffff)',
                  color: 'var(--text-primary, #0f172a)'
                }}
              />
              <button 
                type="submit" 
                disabled={loading || !searchId.trim()}
                className="fetch-btn"
              >
                {loading ? 'Fetching...' : 'Fetch Structure'}
              </button>
            </form>
            <p className={`status-text ${status.startsWith('Error') ? 'error' : ''}`}>{status}</p>
          </div>
        </div>,
        document.getElementById('header-portal') || document.body
      )}

      <div className={`molstar-wrapper msp-theme-${theme}`} style={{ flexGrow: 1, position: 'relative', width: '100%', height: '100%' }}>
        {plugin && <Plugin plugin={plugin} />}
      </div>
    </section>
  );
}

