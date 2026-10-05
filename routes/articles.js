const express = require('express');
const https = require('https');

const router = express.Router();

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const CAT_QUERIES = {
  Nutrition: 'healthy nutrition diet food',
  Fitness: 'fitness workout exercise gym',
  'Weight Loss': 'weight loss fat burn diet',
  'Mental Health': 'mental health wellness mindfulness',
  Wellness: 'health wellness lifestyle tips',
  'For You': 'health fitness nutrition wellness',
};

// Safe HTTPS GET helper
function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Alviva/1.0 (health and nutrition app)',
          Accept: 'application/json',
          ...extraHeaders,
        },
      },
      (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);

            if (
              response.statusCode &&
              (response.statusCode < 200 || response.statusCode >= 300)
            ) {
              return reject(
                new Error(
                  parsed?.message ||
                    `External API returned status ${response.statusCode}`
                )
              );
            }

            resolve(parsed);
          } catch {
            reject(new Error('Invalid response from external API'));
          }
        });
      }
    );

    request.setTimeout(10000, () => {
      request.destroy(new Error('External API request timed out'));
    });

    request.on('error', reject);
  });
}

// GET /api/articles/news
router.get('/news', async (req, res) => {
  try {
    if (!NEWS_API_KEY) {
      console.error('NEWS_API_KEY is missing');

      return res.status(503).json({
        success: false,
        message: 'News service is temporarily unavailable',
      });
    }

    const category =
      typeof req.query.category === 'string'
        ? req.query.category.trim()
        : '';

    const search =
      typeof req.query.search === 'string'
        ? req.query.search.trim().slice(0, 100)
        : '';

    const query =
      search ||
      CAT_QUERIES[category] ||
      CAT_QUERIES['For You'];

    const url =
      `https://newsapi.org/v2/everything` +
      `?q=${encodeURIComponent(query)}` +
      `&language=en` +
      `&sortBy=publishedAt` +
      `&pageSize=12`;

    const data = await httpsGet(url, {
      'X-Api-Key': NEWS_API_KEY,
    });

    const articles = Array.isArray(data.articles)
      ? data.articles
          .filter(
            (article) =>
              article?.title &&
              article?.url &&
              article?.urlToImage &&
              !article.title.includes('[Removed]')
          )
          .map((article, index) => ({
            id: `news_${index}`,
            title: article.title,
            description: article.description || '',
            url: article.url,
            image: article.urlToImage,
            source: article.source?.name || 'Health News',
            publishedAt: article.publishedAt,
            category: category || 'Health',
            readTime: `${Math.max(
              1,
              Math.ceil((article.content?.length || 500) / 1000)
            )} min`,
          }))
      : [];

    return res.json({
      success: true,
      data: articles,
    });
  } catch (error) {
    console.error('NewsAPI error:', error.message);

    return res.status(502).json({
      success: false,
      message: 'Unable to load news right now',
    });
  }
});

// GET /api/articles/videos
router.get('/videos', async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      console.error('YOUTUBE_API_KEY is missing');

      return res.status(503).json({
        success: false,
        message: 'Video service is temporarily unavailable',
      });
    }

    const category =
      typeof req.query.category === 'string'
        ? req.query.category.trim()
        : '';

    const query =
      CAT_QUERIES[category] ||
      CAT_QUERIES['For You'];

    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&q=${encodeURIComponent(query)}` +
      `&type=video` +
      `&maxResults=8` +
      `&order=relevance` +
      `&safeSearch=strict` +
      `&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;

    const data = await httpsGet(url);

    const videos = Array.isArray(data.items)
      ? data.items
          .filter((item) => item?.id?.videoId && item?.snippet)
          .map((item) => ({
            id: item.id.videoId,
            videoId: item.id.videoId,
            title: item.snippet.title,
            channel: item.snippet.channelTitle,
            thumb:
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              null,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            category: category || 'Health',
            publishedAt: item.snippet.publishedAt,
          }))
      : [];

    return res.json({
      success: true,
      data: videos,
    });
  } catch (error) {
    console.error('YouTube API error:', error.message);

    return res.status(502).json({
      success: false,
      message: 'Unable to load videos right now',
    });
  }
});

// GET /api/articles
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Use /news for articles and /videos for videos',
  });
});

module.exports = router;