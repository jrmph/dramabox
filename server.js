const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const cors = require('cors'); // Added CORS for external access
const app = express();
const PORT = 3000;

// ==========================================
// CONFIGURATION
// ==========================================
const TARGET_URL = 'https://regexd.com/base.php';
const MAX_RETRIES = 3;
const TIMEOUT = 15000; // 15 Seconds timeout

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ADVANCED UTILITIES
// ==========================================

// 1. Browser-like Headers Generator
const getHeaders = (referer = TARGET_URL) => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': referer,
  'X-Requested-With': 'XMLHttpRequest', // Important for PHP AJAX handlers
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
});

// 2. ID Extractor (Enhanced Regex)
const extractBookId = (urlOrString) => {
  if (!urlOrString) return null;
  try {
    // Match ?bookId=12345 or &bookId=12345
    const match = urlOrString.match(/[?&]bookId=(\d+)/);
    if (match) return match[1];
    
    // Fallback: Check if it's just a raw number
    if (/^\d+$/.test(urlOrString)) return urlOrString;
    
    return null;
  } catch (e) {
    return null;
  }
};

// 3. Robust Fetcher with Retry Logic
const fetchWithRetry = async (params, retries = MAX_RETRIES) => {
  try {
    const config = {
      method: 'GET', // Change to 'POST' if the PHP file expects POST data
      url: TARGET_URL,
      params: params,
      headers: getHeaders(),
      timeout: TIMEOUT
    };
    
    // console.log(`[FETCH] Requesting... (Attempt ${MAX_RETRIES - retries + 1})`);
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.warn(`[RETRY] Request failed. Retrying in 1s... (${retries} left)`);
      await new Promise(res => setTimeout(res, 1000));
      return fetchWithRetry(params, retries - 1);
    }
    throw error;
  }
};

// ==========================================
// API ROUTES
// ==========================================

// Documentation Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Search Endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing parameter: q' });
  
  try {
    const data = await fetchWithRetry({ q: query, lang: 'en' });
    
    // Handle if response is JSON (API mode) or HTML (Web mode)
    let searchResults = [];
    let resultCount = "0 results";
    
    if (typeof data === 'object') {
      // Assume JSON response
      // Adapt this part based on actual JSON structure if regexd returns JSON
      if (data.data && Array.isArray(data.data)) {
        searchResults = data.data;
      }
    } else {
      // Assume HTML response (Scraping)
      const $ = cheerio.load(data);
      resultCount = $('.search-results-count').text().trim() || "Results found";
      
      $('.drama-grid .drama-card, .result-item').each((index, element) => {
        const title = $(element).find('.drama-title, .title').text().trim();
        const cover = $(element).find('img').attr('src');
        const link = $(element).find('a').attr('href');
        const meta = $(element).find('.drama-meta, .meta').text().trim();
        
        if (title && link) {
          searchResults.push({
            bookId: extractBookId(link),
            title: title,
            cover: cover,
            meta: meta,
            raw_link: link
          });
        }
      });
    }
    
    res.json({
      status: 'success',
      source: 'regexd.com',
      query,
      info: resultCount,
      count: searchResults.length,
      data: searchResults
    });
    
  } catch (error) {
    console.error('[SEARCH ERROR]', error.message);
    res.status(502).json({ error: 'Upstream error', details: error.message });
  }
});

// 2. Detail Endpoint
app.get('/api/detail', async (req, res) => {
  const bookId = req.query.bookId;
  if (!bookId) return res.status(400).json({ error: 'Missing parameter: bookId' });
  
  try {
    const data = await fetchWithRetry({ bookId: bookId, lang: 'en' });
    const $ = cheerio.load(data);
    
    // Advanced Scraping Strategy: Try multiple selectors just in case class names change
    const title = $('h1.video-title').text().trim() || $('h1').first().text().trim();
    const desc = $('.video-description').text().trim() || $('meta[name="description"]').attr('content');
    const cover = $('meta[property="og:image"]').attr('content') || $('.video-cover img').attr('src');
    
    const episodes = [];
    // Support multiple episode list formats
    $('#episodesList .episode-btn, .chapter-list a').each((i, el) => {
      const id = $(el).attr('data-episode') || $(el).attr('data-id');
      const name = $(el).text().trim();
      if (id) {
        episodes.push({ index: parseInt(id), name: name });
      }
    });
    
    res.json({
      status: 'success',
      bookId,
      title,
      description: desc,
      cover,
      total_episodes: episodes.length,
      episodes
    });
    
  } catch (error) {
    console.error('[DETAIL ERROR]', error.message);
    res.status(502).json({ error: 'Upstream error', details: error.message });
  }
});

// 3. Stream Endpoint (The tricky one)
app.get('/api/stream', async (req, res) => {
  const { bookId, episode } = req.query;
  if (!bookId || !episode) return res.status(400).json({ error: 'Missing bookId or episode' });
  
  try {
    // Many PHP video backends require "ajax=1" to return JSON instead of HTML
    const data = await fetchWithRetry({
      bookId,
      episode,
      lang: 'en',
      ajax: 1, // Force AJAX mode
      source: 'detail'
    });
    
    // Validation: Ensure we got a valid object
    if (typeof data !== 'object') {
      throw new Error('Invalid response format (Expected JSON, got HTML string)');
    }
    
    res.json({
      status: 'success',
      data: data // Forwarding raw data from regexd
    });
    
  } catch (error) {
    console.error('[STREAM ERROR]', error.message);
    res.status(502).json({
      status: 'error',
      message: 'Failed to retrieve stream. The link might be encrypted or protected.',
      details: error.message
    });
  }
});

// 4. Latest Endpoint
app.get('/api/latest', async (req, res) => {
  const page = req.query.page || 1;
  try {
    const data = await fetchWithRetry({ page, lang: 'en' });
    const $ = cheerio.load(data);
    const results = [];
    
    $('.drama-grid .drama-card').each((i, el) => {
      const link = $(el).find('a').attr('href');
      results.push({
        bookId: extractBookId(link),
        title: $(el).find('.drama-title').text().trim(),
        cover: $(el).find('img').attr('src')
      });
    });
    
    res.json({ status: 'success', page, data: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 ADVANCED SERVER RUNNING`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`URL: http://localhost:${PORT}`);
});