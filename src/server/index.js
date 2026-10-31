import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import serve from 'koa-static';
import mount from 'koa-mount';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

import { runLinkSearch } from './tools/e-link-search.mjs';

// Load environment variables
config({ path: './.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Koa();
const router = new Router();
app.use(bodyParser());

// 1. Zod schema for incoming PubMed search requests
const pubmedSearchSchema = z.object({
  query: z.string().min(1, "Search term cannot be empty"),
  maxResults: z.number().int().positive().default(100)
});

// Zod schema for fetching specific PMIDs
const pubmedFetchSchema = z.object({
  pmids: z.array(z.string()).min(1, "At least one PMID is required")
});

// 2. Initialize the MCP Client
const mcpClient = new Client(
  { name: "koa-pubmed-client", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Configure the Stdio Transport for the NCBI Server
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@iflow-mcp/pubmed-mcp-server"],
  env: {
    ...process.env,
    NCBI_EMAIL: process.env.NCBI_EMAIL
  }
});

// --- NEW: Transport Listener ---
// Intercept all incoming and outgoing JSON-RPC messages
transport.onmessage = (message) => {
  // Log outgoing tool execution requests
  if (message.method === "tools/call") {
    console.log(`\n[📡 MCP OUT] Request ID: ${message.id}`);
    console.log(`▶ Tool: ${message.params.name}`);
    console.log(`▶ Args:`, JSON.stringify(message.params.arguments, null, 2));
  }

  // Log incoming successful responses
  if (message.result) {
    console.log(`\n[📥 MCP IN] Response for ID: ${message.id}`);
    // Truncate long results to keep the console clean
    const summary = JSON.stringify(message.result).substring(0, 200);
    console.log(`◀ Result: ${summary}...`);
  }

  // Log incoming errors
  if (message.error) {
    console.error(`\n[🚨 MCP ERROR] Response for ID: ${message.id}`);
    console.error(`◀ Error Code: ${message.error.code}`);
    console.error(`◀ Message: ${message.error.message}`);
  }
};

// Connect to the MCP server
async function connectMCP() {
  try {
    await mcpClient.connect(transport);
    console.log("Connected to @iflow-mcp/pubmed-mcp-server");
  } catch (error) {
    console.error("Failed to connect to MCP server:", error);
    // Optional: Keep server running even if MCP fails
  }
}
connectMCP();

// API Health Check Route
router.get('/api/health', async (ctx) => {
  ctx.body = { status: 'healthy', timestamp: new Date() };
});

// Route to fetch structure data based on PubMed ID
router.get('/api/structure/:pubmedId', async (ctx) => {
  const { pubmedId } = ctx.params;
  
  try {
    // Perform a comprehensive link search (NCBI LinkSets + UniProt Fallback)
    const results = await runLinkSearch(pubmedId);
    
    // Check if we found anything actionable (PDB codes, structures, or BLAST-ready DBs)
    const hasData = (results.pdb && results.pdb.length > 0) || 
                    results.structure || 
                    (results.blastDbs && results.blastDbs.length > 0);

    // for results with missing attributes
    if (!hasData) {
      ctx.status = 200;
      ctx.body = { 
        data: [],
        message: 'No structural or linkage data found for this PubMed ID' 
      };
      return;
    }

    // Flatten the response for the frontend: prioritize resolved structure objects, then PDB arrays
    const dataToSend = results.structure || (results.pdb && results.pdb.length > 0 ? results.pdb : results);

    ctx.status = 200;
    ctx.body = { data: dataToSend };
  } catch (error) {
    console.error(`Link search error for PMID ${pubmedId}:`, error);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error while performing link search' };
  }
});

// PubMed Search Route
router.post('/api/pubmed/search', async (ctx) => {
  try {
    const { query, maxResults } = pubmedSearchSchema.parse(ctx.request.body);

    const cleanQuery = decodeURIComponent(query.replace(/\+/g, ' ')).trim();
    console.log(`Searching PubMed for: "${cleanQuery}" (limit: ${maxResults})`);

    // STEP 1: Search for PMIDs
    const searchResponse = await mcpClient.callTool(
  {
    name: "pubmed_search_articles",
    arguments: {
      queryTerm: cleanQuery,
      maxResults: maxResults,
      sortBy: "relevance"
    }
  },
  undefined, // Schema override (pass undefined to use default)
  {
    timeout: 120000 // 120 seconds in milliseconds
  }
);
    const searchText = searchResponse.content[0].text;
    
    // Defensive JSON parsing
    let searchData;
    try {
      searchData = JSON.parse(searchText);
    } catch (e) {
      ctx.status = 502;
      ctx.body = { success: false, message: `Upstream MCP Error (Invalid JSON): ${searchText.substring(0, 100)}` };
      return;
    }

    const totalCount = searchData.totalFound || searchData.total || searchData.count || 0;
    const allPmids = (searchData.pmids || []).map(id => String(id));

    console.log(`Found ${allPmids.length} PMIDs total. (API limit: ${maxResults})`);

    if (allPmids.length === 0) {
      ctx.body = { success: true, totalCount: 0, allPmids: [], data: [] };
      return;
    }

    // STEP 2: Fetch details for the first page (top 20) by default
    const firstPagePmids = allPmids.slice(0, 20);
    const fetchResponse = await mcpClient.callTool({
      name: "pubmed_fetch_contents",
      arguments: {
        pmids: firstPagePmids,
        detailLevel: "abstract_plus"
      }
    });

    const fetchText = fetchResponse.content[0].text;
    let fetchedData;
    try {
      fetchedData = JSON.parse(fetchText);
    } catch (e) {
      ctx.status = 502;
      ctx.body = { success: false, message: `Upstream Fetch Error: ${fetchText.substring(0, 100)}` };
      return;
    }

const articles = (fetchedData.articles || []).map(a => ({
  pmid: a.pmid,
  title: a.title,
  authors: Array.isArray(a.authors) 
    ? a.authors.map(author => `${author.firstName || ''} ${author.lastName || ''}`.trim()) 
    : [],
  journal: a.journalInfo?.title || 'Unknown Journal',
  pubDate: a.journalInfo?.publicationDate 
    ? `${a.journalInfo.publicationDate.year || ''} ${a.journalInfo.publicationDate.month || ''}`.trim() 
    : 'Unknown Date',
  abstract: a.abstractText || 'No abstract available.',
  
  // FIXED SEED FLAG: Direct, explicitly available boolean string key passed to the component
  is3DViewerEligible: true
}));




    ctx.body = { 
      success: true, 
      totalCount: totalCount,
      allPmids: allPmids, // Send all PMIDs to client for pagination
      data: articles
    };
    
  } catch (error) {
    console.error("PubMed Search Error:", error);
    ctx.status = error instanceof z.ZodError ? 400 : 500;
    ctx.body = { success: false, message: error.message || 'Internal Server Error' };
  }
});

// PubMed Fetch Route (Directly takes PMIDs)
router.post('/api/pubmed/fetch', async (ctx) => {
  try {
    const { pmids } = pubmedFetchSchema.parse(ctx.request.body);

    console.log(`Fetching details for ${pmids.length} PMIDs`);

    const fetchResponse = await mcpClient.callTool({
      name: "pubmed_fetch_contents",
      arguments: {
        pmids: pmids,
        detailLevel: "abstract_plus"
      }
    });

    const fetchText = fetchResponse.content[0].text;
    let fetchedData;
    try {
      fetchedData = JSON.parse(fetchText);
    } catch (e) {
      ctx.status = 502;
      ctx.body = { success: false, message: `Upstream Fetch Error: ${fetchText.substring(0, 100)}` };
      return;
    }

const articles = (fetchedData.articles || []).map(a => ({
  pmid: a.pmid,
  title: a.title,
  authors: Array.isArray(a.authors) 
    ? a.authors.map(author => `${author.firstName || ''} ${author.lastName || ''}`.trim()) 
    : [],
  journal: a.journalInfo?.title || 'Unknown Journal',
  pubDate: a.journalInfo?.publicationDate 
    ? `${a.journalInfo.publicationDate.year || ''} ${a.journalInfo.publicationDate.month || ''}`.trim() 
    : 'Unknown Date',
  abstract: a.abstractText || 'No abstract available.',
  
  // FIXED SEED FLAG: Direct, explicitly available boolean string key passed to the component
  is3DViewerEligible: true
}));




    ctx.body = { success: true, data: articles };

  } catch (error) {
    console.error("PubMed Fetch Error:", error);
    ctx.status = error instanceof z.ZodError ? 400 : 500;
    ctx.body = { success: false, message: error.message || 'Internal Server Error' };
  }
});

// MeSH Lookup Route
router.post('/api/pubmed/mesh-lookup', async (ctx) => {
  try {
    const { term } = z.object({ term: z.string().min(1) }).parse(ctx.request.body);

    console.log(`Looking up MeSH terms for: "${term}"`);

    // STEP 1: Search for PMIDs
    const searchResponse = await mcpClient.callTool({
      name: "pubmed_search_articles",
      arguments: {
        queryTerm: term,
        maxResults: 20
      }
    });

    const searchData = JSON.parse(searchResponse.content[0].text);
    const pmids = (searchData.pmids || []).map(id => String(id));

    if (pmids.length === 0) {
      ctx.body = { success: true, suggestions: [] };
      return;
    }

    // STEP 2: Fetch detailed contents
    const fetchResponse = await mcpClient.callTool({
      name: "pubmed_fetch_contents",
      arguments: {
        pmids: pmids,
        detailLevel: "abstract_plus",
        includeMeshTerms: true
      }
    });

    const fetchedData = JSON.parse(fetchResponse.content[0].text);
    
    // STEP 3: Aggregate MeSH terms
    const meshCounts = {};
    (fetchedData.articles || []).forEach(article => {
      if (article.meshTerms && Array.isArray(article.meshTerms)) {
        article.meshTerms.forEach(mesh => {
          // MCP returns descriptorName, but sometimes it might be just a string
          const termName = typeof mesh === 'string' ? mesh : (mesh.descriptorName || mesh.term);
          if (termName) {
            meshCounts[termName] = (meshCounts[termName] || 0) + 1;
          }
        });
      }
    });

    // STEP 4: Sort and filter top suggestions
    const suggestions = Object.entries(meshCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    ctx.body = { success: true, suggestions };

  } catch (error) {
    console.error("MeSH Lookup Error:", error);
    ctx.status = error instanceof z.ZodError ? 400 : 500;
    ctx.body = { success: false, message: error.message || 'Internal Server Error' };
  }
});

const RESEARCH_DIR = path.join(process.cwd(), 'research');
const DIST_DIR = path.resolve(__dirname, '../../dist');

router.post('/api/pubmed/bulk-save', async (ctx) => {
  try {
    const { articles } = ctx.request.body;

    if (!articles || !Array.isArray(articles)) {
      ctx.status = 400;
      ctx.body = { success: false, message: "No articles provided" };
      return;
    }

    // Ensure the research directory exists
    await fs.mkdir(RESEARCH_DIR, { recursive: true });

    const savePromises = articles.map(async (article) => {
      const { pmid, title, authors, journal, pubDate, abstract } = article;
      
      const formattedAuthors = Array.isArray(authors) ? authors.join(', ') : (authors || 'N/A');
      const fileName = `PMID_${pmid || 'unknown'}_${(title || 'article').substring(0, 30).replace(/[^a-z0-9]/gi, '_')}.txt`;
      const filePath = path.join(RESEARCH_DIR, fileName);

      const content = `
TITLE: ${title || 'Untitled'}
AUTHORS: ${formattedAuthors}
JOURNAL: ${journal || 'N/A'}
DATE: ${pubDate || 'N/A'}
PMID: ${pmid || 'N/A'}

ABSTRACT:
${abstract || 'No abstract available.'}
      `.trim();

      return fs.writeFile(filePath, content, 'utf8');
    });

    await Promise.all(savePromises);

    ctx.body = { 
      success: true, 
      message: `Successfully saved ${articles.length} articles to ${RESEARCH_DIR}` 
    };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// 1. API Routes
app.use(router.routes()).use(router.allowedMethods());

// 2. Static Assets
app.use(serve(DIST_DIR));

// 3. SPA Fallback (Catch-all)
app.use(async (ctx, next) => {
  // Only fallback for non-API routes and GET requests that aren't handled by static middleware
  if (ctx.status === 404 && ctx.method === 'GET' && !ctx.path.startsWith('/api')) {
    try {
      const indexHtml = await fs.readFile(path.join(DIST_DIR, 'index.html'), 'utf-8');
      ctx.type = 'text/html';
      ctx.body = indexHtml;
    } catch (e) {
      // If index.html is missing (e.g. not built yet), continue to 404
      await next();
    }
  } else {
    await next();
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

export default app;