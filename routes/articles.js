const express = require('express');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const verifyToken = require('./middleware/verifyToken');
const { apiLimiter } = require('./middleware/rateLimit');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const CAT_QUERIES = {
  Nutrition: 'healthy nutrition balanced diet food',
  Fitness: 'fitness workout exercise health',
  'Weight Loss': 'healthy sustainable weight management nutrition exercise',
  'Mental Health': 'mental health wellness mindfulness',
  Wellness: 'health wellness lifestyle tips',
  'For You': 'healthy nutrition fitness wellness',
};

// ─────────────────────────────────────
// Helpers
// ─────────────────────────────────────

function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Alviva/1.0 (health and nutrition app)',
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
              (
                response.statusCode < 200 ||
                response.statusCode >= 300
              )
            ) {
              return reject(
                new Error(
                  parsed?.message ||
                    `External API status ${response.statusCode}`
                )
              );
            }

            return resolve(parsed);
          } catch {
            return reject(
              new Error(
                'Invalid external API response'
              )
            );
          }
        });
      }
    );

    request.setTimeout(
      10000,
      () => {
        request.destroy(
          new Error(
            'External API request timed out'
          )
        );
      }
    );

    request.on('error', reject);
  });
}

function calculateBMI(weight, height) {
  const weightNum = Number(weight);
  const heightNum = Number(height);

  if (
    !Number.isFinite(weightNum) ||
    !Number.isFinite(heightNum) ||
    weightNum <= 0 ||
    heightNum <= 0
  ) {
    return null;
  }

  const heightM = heightNum / 100;

  return (
    Math.round(
      (weightNum / (heightM * heightM)) * 10
    ) / 10
  );
}

function getPersonalizedContent(bmi) {
  if (!Number.isFinite(bmi)) {
    return {
      category: 'General Wellness',
      query:
        'healthy nutrition fitness wellness lifestyle',
    };
  }

  if (bmi < 18.5) {
    return {
      category: 'Healthy Weight Gain',
      query:
        'healthy weight gain balanced nutrition strength training protein foods',
    };
  }

  if (bmi < 25) {
    return {
      category: 'Healthy Maintenance',
      query:
        'healthy weight maintenance balanced nutrition fitness exercise',
    };
  }

  if (bmi < 30) {
    return {
      category: 'Healthy Weight Management',
      query:
        'healthy sustainable weight management high protein meals walking beginner exercise',
    };
  }

  return {
    category: 'Healthy Weight Management',
    query:
      'healthy sustainable weight management balanced nutrition low impact exercise',
  };
}

// ─────────────────────────────────────
// Fetch News
// ─────────────────────────────────────

async function fetchNews(
  query,
  category = 'Health'
) {
  if (!NEWS_API_KEY) {
    throw new Error(
      'NEWS_API_KEY missing'
    );
  }

  const url =
    'https://newsapi.org/v2/everything' +
    `?q=${encodeURIComponent(query)}` +
    '&language=en' +
    '&sortBy=publishedAt' +
    '&pageSize=8';

  const data = await httpsGet(
    url,
    {
      'X-Api-Key':
        NEWS_API_KEY,
    }
  );

  if (!Array.isArray(data?.articles)) {
    return [];
  }

  return data.articles
    .filter(
      (article) =>
        article?.title &&
        article?.url &&
        article?.urlToImage &&
        !article.title.includes(
          '[Removed]'
        )
    )
    .slice(0, 8)
    .map(
      (article, index) => ({
        id: `news_${index}`,

        title:
          article.title,

        description:
          article.description ||
          '',

        url:
          article.url,

        image:
          article.urlToImage,

        source:
          article.source?.name ||
          'Health News',

        publishedAt:
          article.publishedAt,

        category,

        readTime:
          `${Math.max(
            1,
            Math.ceil(
              (
                article.content
                  ?.length ||
                500
              ) / 1000
            )
          )} min`,
      })
    );
}

// ─────────────────────────────────────
// Fetch YouTube Videos
// ─────────────────────────────────────

async function fetchVideos(
  query,
  category = 'Health'
) {
  if (!YOUTUBE_API_KEY) {
    throw new Error(
      'YOUTUBE_API_KEY missing'
    );
  }

  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    '?part=snippet' +
    `&q=${encodeURIComponent(query)}` +
    '&type=video' +
    '&maxResults=6' +
    '&order=relevance' +
    '&safeSearch=strict' +
    `&key=${encodeURIComponent(
      YOUTUBE_API_KEY
    )}`;

  const data =
    await httpsGet(url);

  if (!Array.isArray(data?.items)) {
    return [];
  }

  return data.items
    .filter(
      (item) =>
        item?.id?.videoId &&
        item?.snippet
    )
    .map((item) => ({
      id:
        item.id.videoId,

      videoId:
        item.id.videoId,

      title:
        item.snippet.title,

      channel:
        item.snippet
          .channelTitle,

      thumb:
        item.snippet
          .thumbnails
          ?.medium
          ?.url ||
        item.snippet
          .thumbnails
          ?.default
          ?.url ||
        null,

      url:
        `https://www.youtube.com/watch?v=${item.id.videoId}`,

      category,

      publishedAt:
        item.snippet
          .publishedAt,
    }));
}

// ─────────────────────────────────────
// GET /api/articles/for-you
// Personalized by user's BMI
// ─────────────────────────────────────

router.get(
  '/for-you',
  apiLimiter,
  verifyToken,
  async (req, res) => {
    try {
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(
          `
          weight,
          height,
          activity_level
          `
        )
        .eq(
          'id',
          req.user.id
        )
        .single();

      if (profileError) {
        console.error(
          'For You profile error:',
          profileError.message
        );

        return res.status(500).json({
          success: false,
          message:
            'Unable to load personalized content',
        });
      }

      const bmi =
        calculateBMI(
          profile?.weight,
          profile?.height
        );

      const recommendation =
        getPersonalizedContent(
          bmi
        );

      const results =
        await Promise.allSettled([
          fetchNews(
            recommendation.query,
            recommendation.category
          ),

          fetchVideos(
            recommendation.query,
            recommendation.category
          ),
        ]);

      const articles =
        results[0].status ===
        'fulfilled'
          ? results[0].value
          : [];

      const videos =
        results[1].status ===
        'fulfilled'
          ? results[1].value
          : [];

      if (
        results[0].status ===
        'rejected'
      ) {
        console.error(
          'Personalized news error:',
          results[0].reason
            ?.message
        );
      }

      if (
        results[1].status ===
        'rejected'
      ) {
        console.error(
          'Personalized video error:',
          results[1].reason
            ?.message
        );
      }

      return res.json({
        success: true,

        personalized: true,

        recommendation: {
          bmi,

          category:
            recommendation.category,

          message:
            'Content selected from your current profile.',
        },

        articles,
        videos,
      });
    } catch (error) {
      console.error(
        'For You error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load personalized content',
      });
    }
  }
);

// ─────────────────────────────────────
// GET /api/articles/news
// ─────────────────────────────────────

router.get(
  '/news',
  apiLimiter,
  async (req, res) => {
    try {
      const category =
        typeof req.query.category ===
        'string'
          ? req.query.category
              .trim()
              .slice(0, 50)
          : '';

      const search =
        typeof req.query.search ===
        'string'
          ? req.query.search
              .trim()
              .slice(0, 100)
          : '';

      const query =
        search ||
        CAT_QUERIES[category] ||
        CAT_QUERIES['For You'];

      const articles =
        await fetchNews(
          query,
          category || 'Health'
        );

      return res.json({
        success: true,
        data: articles,
      });
    } catch (error) {
      console.error(
        'News API error:',
        error.message
      );

      return res.status(502).json({
        success: false,
        message:
          'Unable to load news right now',
      });
    }
  }
);

// ─────────────────────────────────────
// GET /api/articles/videos
// ─────────────────────────────────────

router.get(
  '/videos',
  apiLimiter,
  async (req, res) => {
    try {
      const category =
        typeof req.query.category ===
        'string'
          ? req.query.category
              .trim()
              .slice(0, 50)
          : '';

      const query =
        CAT_QUERIES[category] ||
        CAT_QUERIES['For You'];

      const videos =
        await fetchVideos(
          query,
          category || 'Health'
        );

      return res.json({
        success: true,
        data: videos,
      });
    } catch (error) {
      console.error(
        'YouTube API error:',
        error.message
      );

      return res.status(502).json({
        success: false,
        message:
          'Unable to load videos right now',
      });
    }
  }
);

// ─────────────────────────────────────
// GET /api/articles
// ─────────────────────────────────────

router.get(
  '/',
  (req, res) => {
    return res.json({
      success: true,

      endpoints: {
        personalized:
          '/api/articles/for-you',

        news:
          '/api/articles/news',

        videos:
          '/api/articles/videos',
      },
    });
  }
);

module.exports = router;