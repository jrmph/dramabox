const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const app = express();
const PORT = 3000;

// ⚠️ IMPORTANT: CHANGE THIS TO THE REAL SITE URL
// Kung may alam kang working site, ipalit mo dito.
// Example: 'https://www.dramabox.com' or similar
const TARGET_DOMAIN = 'https://regexd.com'; 

const BASE_URL   = `${TARGET_DOMAIN}/base.php`;
const SEARCH_URL = `${TARGET_DOMAIN}/base.php`;
const DETAIL_URL = `${TARGET_DOMAIN}/base.php`;

// Better Headers to look like a Real Browser
const getHeaders = () => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': TARGET_DOMAIN,
    'X-Requested-With': 'XMLHttpRequest'
});

// Helper: Extract Book ID safely
const extractBookId = (url) => {
    if (!url) return null;
    try {
        // Handle relative URLs
        const fullUrl = url.startsWith('http') ? url : `${TARGET_DOMAIN}/${url.replace(/^\//, '')}`;
        const urlObj = new URL(fullUrl);
        return urlObj.searchParams.get('bookId');
    } catch (e) {
        console.error('Error extracting ID from URL:', url);
        return null;
    }
};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 1. Search Endpoint
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    const lang = 'en';

    if (!query) return res.status(400).json({ error: 'Parameter "q" is required' });

    console.log(`[SEARCH] Searching for: ${query}...`);

    try {
        const response = await axios.get(SEARCH_URL, {
            params: { q: query, lang },
            headers: getHeaders(),
            timeout: 10000 // 10 seconds timeout
        });

        const $ = cheerio.load(response.data);
        const searchResults = [];
        const resultCountText = $('.search-results-count').text().trim();

        // Check if we actually got HTML with the expected class
        const cards = $('.drama-grid .drama-card');
        if (cards.length === 0) {
            console.warn('[SEARCH] No drama cards found. Selector mismatch or empty result.');
        }

        cards.each((index, element) => {
            const title = $(element).find('.drama-title').text().trim();
            const cover = $(element).find('.drama-image img').attr('src');
            let episodeText = $(element).find('.drama-meta span[itemprop="numberOfEpisodes"]').text().trim();
            if (!episodeText) episodeText = $(element).find('.drama-meta').text().replace('👁️ 0', '').trim();
            const linkHref = $(element).find('a.watch-button').attr('href');

            searchResults.push({
                bookId: extractBookId(linkHref),
                title: title,
                total_episodes: episodeText.replace('📺', '').trim(),
                cover: cover
            });
        });

        res.json({
            status: 'success',
            query,
            info: resultCountText,
            total_results: searchResults.length,
            data: searchResults
        });
    } catch (error) {
        console.error('[SEARCH ERROR]', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            // console.error('Data:', error.response.data); // Uncomment to see raw HTML response
        }
        res.status(500).json({ error: error.message, details: 'Check server console for logs' });
    }
});

// 2. Latest Releases Endpoint
app.get('/api/latest', async (req, res) => {
    const page = req.query.page || 1;
    const lang = 'en';
    
    console.log(`[LATEST] Fetching page ${page}...`);

    try {
        const response = await axios.get(BASE_URL, {
            params: { page, lang },
            headers: getHeaders(),
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const dramas = [];

        $('.drama-grid .drama-card').each((index, element) => {
            const title = $(element).find('.drama-title').text().trim();
            const cover = $(element).find('.drama-image img').attr('src');
            const episodeText = $(element).find('.drama-meta span').text().trim();
            const linkHref = $(element).find('a.watch-button').attr('href');
            
            dramas.push({
                bookId: extractBookId(linkHref),
                title: title,
                total_episodes: episodeText.replace('📺', '').trim(),
                cover: cover
            });
        });

        res.json({
            status: 'success',
            type: 'latest',
            page: parseInt(page),
            total: dramas.length,
            data: dramas
        });
    } catch (error) {
        console.error('[LATEST ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 3. Trending/Ranking Endpoint
app.get('/api/trending', async (req, res) => {
    const lang = 'en';

    console.log(`[TRENDING] Fetching trending...`);

    try {
        const response = await axios.get(BASE_URL, {
            params: { page: 1, lang },
            headers: getHeaders(),
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const trendingDramas = [];

        $('.rank-list .rank-item').each((index, element) => {
            const title = $(element).find('.rank-title').text().trim();
            const cover = $(element).find('.rank-image img').attr('src');
            const episodeText = $(element).find('.rank-meta span').text().trim();
            const rankNumber = $(element).find('.rank-number').text().trim();
            const linkHref = $(element).attr('href');

            trendingDramas.push({
                rank: parseInt(rankNumber),
                bookId: extractBookId(linkHref),
                title: title,
                total_episodes: episodeText.replace('📺', '').trim(),
                cover: cover
            });
        });

        res.json({
            status: 'success',
            type: 'trending',
            total: trendingDramas.length,
            data: trendingDramas
        });
    } catch (error) {
        console.error('[TRENDING ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4. Details Endpoint
app.get('/api/detail', async (req, res) => {
    const bookId = req.query.bookId;
    const lang = 'en';

    if (!bookId) return res.status(400).json({ status: 'error', message: 'Parameter bookId is required.' });

    console.log(`[DETAIL] Fetching bookId: ${bookId}...`);

    try {
        const response = await axios.get(DETAIL_URL, {
            params: { bookId, lang },
            headers: getHeaders(),
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        
        // Safety check for title
        let cleanTitle = "Unknown Title";
        const titleEl = $('h1.video-title');
        if (titleEl.length) {
            const rawTitleHtml = titleEl.html();
            cleanTitle = rawTitleHtml ? rawTitleHtml.split('<span')[0].trim().replace(/ - Episode$/i, '').replace(/-$/, '').trim() : titleEl.text().trim();
        }

        const description = $('.video-description').text().trim() || "No description available";
        const cover = $('meta[itemprop="thumbnailUrl"]').attr('content') || "";
        const totalEpisodeText = $('.video-meta span[itemprop="numberOfEpisodes"]').text().trim();
        const likesText = $('.video-meta span').first().text().trim();

        const episodes = [];
        $('#episodesList .episode-btn').each((index, element) => {
            const epNum = $(element).attr('data-episode'); 
            const label = $(element).text().trim(); 
            episodes.push({
                episode_index: parseInt(epNum),
                episode_label: label,
            });
        });

        res.json({
            status: 'success',
            bookId: bookId,
            title: cleanTitle,
            description: description,
            cover: cover,
            total_episodes: totalEpisodeText.replace('📺', '').trim(),
            likes: likesText.replace('❤️', '').trim(),
            available_episodes: episodes.length,
            episodes: episodes
        });

    } catch (error) {
        console.error('[DETAIL ERROR]', error.message);
        res.status(500).json({ status: 'error', message: 'Failed to fetch details', error: error.message });
    }
});

// 5. Stream Endpoint
app.get('/api/stream', async (req, res) => {
    const { bookId, episode } = req.query;
    const lang = req.query.lang || 'en';

    if (!bookId || !episode) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Parameters bookId and episode are required.' 
        });
    }

    console.log(`[STREAM] Fetching stream for Book ${bookId} Ep ${episode}...`);

    try {
        const headers = {
            ...getHeaders(),
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${DETAIL_URL}?bookId=${bookId}`
        };

        const response = await axios.get(DETAIL_URL, {
            params: { 
                ajax: 1,
                bookId: bookId, 
                lang: lang, 
                episode: episode 
            },
            headers: headers,
            timeout: 10000
        });

        const rawData = response.data;

        // Check if rawData is actually JSON or if the server returned an HTML error page
        if (typeof rawData !== 'object') {
            console.error('[STREAM ERROR] Received non-JSON response from upstream.');
            return res.status(502).json({
                status: 'error',
                message: 'Upstream server returned invalid data (likely HTML instead of JSON).'
            });
        }

        if (!rawData || !rawData.chapter) {
            return res.status(404).json({
                status: 'error',
                message: 'Episode not found or locked.'
            });
        }

        const formattedResult = {
            status: "success",
            apiBy: "regexd.com",
            data: {
                bookId: bookId.toString(),
                allEps: rawData.totalEpisodes,
                chapter: {
                    id: rawData.chapter.id,
                    index: rawData.chapter.index,
                    indexCode: rawData.chapter.indexStr,
                    duration: rawData.chapter.duration,
                    cover: rawData.chapter.cover,
                    video: {
                        mp4: rawData.chapter.mp4,
                        m3u8: rawData.chapter.m3u8Url
                    }
                }
            }
        };

        res.json(formattedResult);

    } catch (error) {
        console.error('[STREAM ERROR]', error.message);
        res.status(500).json({ 
            status: 'error', 
            message: 'Failed to fetch stream', 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});