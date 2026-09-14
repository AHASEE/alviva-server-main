const express = require('express');
const router = express.Router();
const https = require('https');

const NEWS_API_KEY    = process.env.NEWS_API_KEY    || 'e6aa4a0dcc294e19a7c1b2c016f2529d';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAVpA6dAjUXCD-FuEUvjYKTvUVN7v5PTgE';

const CAT_QUERIES = {
  'Nutrition':     'healthy nutrition diet food',
  'Fitness':       'fitness workout exercise gym',
  'Weight Loss':   'weight loss fat burn diet',
  'Mental Health': 'mental health wellness mindfulness',
  'Wellness':      'health wellness lifestyle tips',
  'For You':       'health fitness nutrition wellness',
};

// Helper: https GET with User-Agent
function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'CalorieAI/1.0 (health and nutrition app)',
        'Accept': 'application/json',
        ...extraHeaders,
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// GET /api/articles/news
router.get('/news', async (req, res) => {
  const { category, search } = req.query;
  const q = search || CAT_QUERIES[category] || 'health nutrition fitness';

  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=12&apiKey=${NEWS_API_KEY}`;
    const data = await httpsGet(url, { 'X-Api-Key': NEWS_API_KEY });

    if (data.status !== 'ok') {
      return res.status(500).json({ success: false, message: data.message || 'NewsAPI error' });
    }

    const articles = data.articles
      .filter(a => a.title && a.urlToImage && a.url && !a.title.includes('[Removed]'))
      .map((a, i) => ({
        id: `news_${i}`,
        title: a.title,
        description: a.description || '',
        url: a.url,
        image: a.urlToImage,
        source: a.source?.name || 'Health News',
        publishedAt: a.publishedAt,
        category: category || 'Health',
        readTime: `${Math.max(1, Math.ceil((a.content?.length || 500) / 1000))} min`,
      }));

    res.json({ success: true, data: articles });
  } catch (err) {
    console.error('NewsAPI error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// GET /api/articles/videos
router.get('/videos', async (req, res) => {
  const { category } = req.query;
  const q = CAT_QUERIES[category] || CAT_QUERIES['For You'];

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=8&order=relevance&key=${YOUTUBE_API_KEY}`;
    const data = await httpsGet(url);

    if (data.error) {
      return res.status(500).json({ success: false, message: data.error.message });
    }

    const videos = (data.items || []).map(item => ({
      id: item.id.videoId,
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumb: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      category: category || 'Health',
      publishedAt: item.snippet.publishedAt,
    }));

    res.json({ success: true, data: videos });
  } catch (err) {
    console.error('YouTube error:', err);
    res.status(500).json({ success: false, message: 'YouTube error: ' + err.message });
  }
});

router.get('/', (req, res) => {
  res.json({ success: true, message: 'Use /news for articles, /videos for videos' });
});

module.exports = router;