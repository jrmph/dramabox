const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const app = express();
const PORT = 3000;

const BASE_URL = 'https://regexd.com/base.php';
const SEARCH_URL = 'https://regexd.com/base.php';
const DETAIL_URL = 'https://regexd.com/base.php';

const getHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest'
});

const extractBookId = (url) => {
  if (!url) return null;
  try {
    const fullUrl = url.startsWith('http') ? url : `http://dummy.com/${url}`;
    const urlParams = new URLSearchParams(new URL(fullUrl).search);
    return urlParams.get('bookId');
  } catch (e) {
    return null;
  }
};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const lang = 'in';
  
  if (!query) return res.status(400).json({ error: 'Parameter q required' });
  
  try {
    const response = await axios.get(SEARCH_URL, {
      params: { q: query, lang },
      headers: getHeaders()
    });
    
    const $ = cheerio.load(response.data);
    const searchResults = [];
    const resultCountText = $('.search-results-count').text().trim();
    
    $('.drama-grid .drama-card').each((index, element) => {
      const title = $(element).find('.drama-title').text().trim();
      const cover = $(element).find('.drama-image img').attr('src');
      let episodeText = $(element).find('.drama-meta span[itemprop="numberOfEpisodes"]').text().trim();
      if (!episodeText) episodeText = $(element).find('.drama-meta').text().replace('👁️ 0', '').trim();
      const linkHref = $(element).find('a.watch-button').attr('href');
      
      searchResults.push({
        bookId: extractBookId(linkHref),
        judul: title,
        total_episode: episodeText.replace('📺', '').trim(),
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/latest', async (req, res) => {
  const page = req.query.page || 1;
  const lang = 'in';
  
  try {
    const response = await axios.get(BASE_URL, {
      params: { page, lang },
      headers: getHeaders()
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
        judul: title,
        total_episode: episodeText.replace('📺', '').trim(),
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trending', async (req, res) => {
  const lang = 'in';
  
  try {
    const response = await axios.get(BASE_URL, {
      params: { page: 1, lang },
      headers: getHeaders()
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
        judul: title,
        total_episode: episodeText.replace('📺', '').trim(),
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/detail', async (req, res) => {
  const bookId = req.query.bookId;
  const lang = 'in';
  
  if (!bookId) return res.status(400).json({ status: 'error', message: 'Parameter bookId wajib diisi.' });
  
  try {
    const response = await axios.get(DETAIL_URL, {
      params: { bookId, lang },
      headers: getHeaders()
    });
    
    const $ = cheerio.load(response.data);
    const rawTitleHtml = $('h1.video-title').html();
    let cleanTitle = rawTitleHtml ? rawTitleHtml.split('<span')[0].trim().replace(/ - Episode$/i, '').replace(/-$/, '').trim() : $('h1.video-title').text().trim();
    
    const description = $('.video-description').text().trim();
    const cover = $('meta[itemprop="thumbnailUrl"]').attr('content');
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
      judul: cleanTitle,
      deskripsi: description,
      cover: cover,
      total_episode: totalEpisodeText.replace('📺', '').trim(),
      likes: likesText.replace('❤️', '').trim(),
      jumlah_episode_tersedia: episodes.length,
      episodes: episodes
    });
    
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Gagal mengambil detail drama', error: error.message });
  }
});

app.get('/api/stream', async (req, res) => {
  const { bookId, episode } = req.query;
  const lang = req.query.lang || 'in';
  
  if (!bookId || !episode) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter bookId dan episode wajib diisi.'
    });
  }
  
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
      headers: headers
    });
    
    const rawData = response.data;
    
    if (!rawData || !rawData.chapter) {
      return res.status(404).json({
        status: 'error',
        message: 'Episode tidak ditemukan atau terkunci.'
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
    console.error(error);
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil stream',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});