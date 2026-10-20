# Biostack Mol* Viewer: Backend Data Sync Fix

## The Problem
The frontend and backend were diverging during the structural resolution pipeline. The Koa backend correctly fell back to SWISS-MODEL and retrieved a `.pdb` URL, but the React frontend discarded this URL. Instead, the client took only the `O88844` ID and attempted to fetch it directly from AlphaFold. AlphaFold returned an XML "File Not Found" error, which Mol* silently parsed as an empty `.cif` file, resulting in a blank 3D canvas.

## The Solution
Update the component to trust the data structure provided by the Koa backend. By passing the fully resolved URL and source directly into `loadStructure`, we prevent the client from guessing the wrong EBI endpoint.

### Component Update (`src/client/components/MolstarViewer.jsx`)

Update your `MolstarViewer` component with the modified `loadStructure` function and the corrected `useEffect` hook.

```javascript
  // 2. Load Logic: Updated to accept either a raw ID or a pre-resolved object
  const loadStructure = async (accessionOrData) => {
    const plugin = pluginRef.current;
    if (!plugin) return;

    setLoading(true);
    
    try {
      await plugin.clear();

      let targetStructure;

      // Trust the backend: Check if we already have the resolved URL and source
      if (typeof accessionOrData === 'object' && accessionOrData.url) {
        targetStructure = accessionOrData;
        setStatus(`Loading pre-resolved ${targetStructure.source} structure...`);
      } else {
        // Fallback for manual search bar entries
        setStatus(`Resolving structure for "${accessionOrData}"...`);
        targetStructure = await resolveStructureUrl(accessionOrData);
      }

      if (!targetStructure || !targetStructure.url) {
        setStatus(`Error: Could not retrieve any 3D structures.`);
        return;
      }

      // --- DYNAMIC FORMAT DETECTION ---
      const urlLower = targetStructure.url.toLowerCase();
      let format = 'mmcif';
      let isBinary = false;

      if (urlLower.includes('.bcif')) {
        format = 'cif';
        isBinary = true;
      } else if (urlLower.includes('.pdb') || targetStructure.source === 'SWISS-MODEL') {
        format = 'pdb';
      } else if (urlLower.includes('.cif')) {
        format = 'mmcif';
      }

      const data = await plugin.builders.data.download({ 
        url: targetStructure.url, 
        isBinary: isBinary 
      });
      
      const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
      
      // React 19 / WebGL sync constraints
      plugin.managers.camera.reset();
      plugin.layout.events.updated.next(); 
      
      setStatus(`Success: Loaded ${targetStructure.source}`);
    } catch (error) {
      console.error('Error loading structure:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. Automatic Load if pubmedId is provided in URL
  useEffect(() => {
    if (pubmedId && pluginRef.current) {
      const fetchFromPmid = async () => {
        setStatus(`Fetching structural data for PMID: ${pubmedId}...`);
        try {
          const response = await fetch(`/api/structure/${pubmedId}`);
          if (response.ok) {
            const result = await response.json();
            const data = result.data;
            
            // Route the FULL resolved object (URL and source) directly to Mol*
            if (data && data.url && data.source) {
               loadStructure(data);
            } else if (data && data.uniprot_id) {
               // Fallback if the backend only returned the ID
               loadStructure(data.uniprot_id);
            } else if (Array.isArray(data) && data.length > 0) {
               loadStructure(data[0]); 
            } else {
              setStatus(`No structural data available for PMID: ${pubmedId}`);
            }
          } else {
            setStatus(`No structural data available for PMID: ${pubmedId}`);
          }
        } catch (error) {
          console.error('Error fetching structure for PMID:', error);
          setStatus('Error: Failed to fetch structure data');
        }
      };
      fetchFromPmid();
    }
  }, [pubmedId]); // Removed pluginRef.current to prevent StrictMode double-firing