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

const FALLBACK_ARTICLES = [
  {
    id: 'fallback_calories',
    title: 'How Many Calories Should You Eat Per Day?',
    description: 'A practical overview of daily calorie needs and the factors that can change them.',
    url: 'https://www.healthline.com/nutrition/how-many-calories-per-day',
    image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=900',
    source: 'Healthline',
    publishedAt: '2026-01-01T00:00:00.000Z',
    category: 'Nutrition',
    readTime: '5 min',
  },
  {
    id: 'fallback_protein',
    title: 'Why Protein Matters for Health and Weight Management',
    description: 'Learn why protein supports muscle, satiety and a balanced eating pattern.',
    url: 'https://www.healthline.com/nutrition/10-reasons-to-eat-more-protein',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900',
    source: 'Healthline',
    publishedAt: '2026-01-02T00:00:00.000Z',
    category: 'Nutrition',
    readTime: '6 min',
  },
  {
    id: 'fallback_hiit',
    title: 'Benefits of High-Intensity Interval Training',
    description: 'A simple guide to HIIT and how short workouts can support fitness.',
    url: 'https://www.healthline.com/nutrition/benefits-of-hiit',
    image: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=900',
    source: 'Healthline',
    publishedAt: '2026-01-03T00:00:00.000Z',
    category: 'Fitness',
    readTime: '5 min',
  },
  {
    id: 'fallback_weight_loss',
    title: 'Foods That Can Support Healthy Weight Loss',
    description: 'Whole-food ideas that can fit into a balanced, sustainable weight-loss plan.',
    url: 'https://www.healthline.com/nutrition/weight-loss-foods',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900',
    source: 'Healthline',
    publishedAt: '2026-01-04T00:00:00.000Z',
    category: 'Weight Loss',
    readTime: '7 min',
  },
];

const FALLBACK_VIDEOS = [
  {
    id: 'ml6cT4AZdqI',
    videoId: 'ml6cT4AZdqI',
    title: 'Full Body Workout for Beginners',
    channel: 'FitnessBlender',
    duration: '20 min',
    views: 'Beginner',
    thumb: 'https://img.youtube.com/vi/ml6cT4AZdqI/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=ml6cT4AZdqI',
    category: 'Fitness',
  },
  {
    id: 'cbKkB3POqaY',
    videoId: 'cbKkB3POqaY',
    title: '10 Minute Morning Yoga for Energy',
    channel: 'Yoga With Adriene',
    duration: '10 min',
    views: 'Wellness',
    thumb: 'https://img.youtube.com/vi/cbKkB3POqaY/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=cbKkB3POqaY',
    category: 'Wellness',
  },
  {
    id: 'UItWltVZZmE',
    videoId: 'UItWltVZZmE',
    title: 'Healthy Meal Plan Inspiration',
    channel: 'Healthy Eating',
    duration: 'Video',
    views: 'Nutrition',
    thumb: 'https://img.youtube.com/vi/UItWltVZZmE/hqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=UItWltVZZmE',
    category: 'Nutrition',
  },
];

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

const RECENT_NEWS_DAYS = 21;

function getRecentNewsCutoff() {
  const cutoff = new Date(
    Date.now() -
      RECENT_NEWS_DAYS *
        24 *
        60 *
        60 *
        1000
  );

  return cutoff;
}

async function fetchNews(
  query,
  category = 'Health',
  page = 1,
  pageSize = 10
) {
  if (!NEWS_API_KEY) {
    throw new Error(
      'NEWS_API_KEY missing'
    );
  }

  const safePage =
    Math.min(
      Math.max(
        Number(page) || 1,
        1
      ),
      20
    );

  const safePageSize =
    Math.min(
      Math.max(
        Number(pageSize) || 10,
        1
      ),
      20
    );

  const cutoff =
    getRecentNewsCutoff();

  const fromDate =
    cutoff
      .toISOString()
      .slice(0, 10);

  const url =
    'https://newsapi.org/v2/everything' +
    `?q=${encodeURIComponent(query)}` +
    '&language=en' +
    `&from=${fromDate}` +
    '&sortBy=publishedAt' +
    `&pageSize=${safePageSize}` +
    `&page=${safePage}`;

  const data = await httpsGet(
    url,
    {
      'X-Api-Key':
        NEWS_API_KEY,
    }
  );

  const totalResults =
    Math.max(
      Number(data?.totalResults) || 0,
      0
    );

  if (!Array.isArray(data?.articles)) {
    return {
      items: [],
      page: safePage,
      hasMore: false,
    };
  }

  const items =
    data.articles
      .filter(
        (article) =>
          article?.title &&
          article?.url &&
          article?.urlToImage &&
          article?.publishedAt &&
          new Date(article.publishedAt) >= cutoff &&
          !article.title.includes(
            '[Removed]'
          )
      )
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime()
      )
      .map(
        (article) => ({
          id: article.url,

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

  return {
    items,
    page: safePage,
    hasMore:
      safePage * safePageSize <
      totalResults,
  };
}

// ─────────────────────────────────────
// Fetch YouTube Videos
// ─────────────────────────────────────

async function fetchVideos(
  query,
  category = 'Health',
  pageToken = ''
) {
  if (!YOUTUBE_API_KEY) {
    throw new Error(
      'YOUTUBE_API_KEY missing'
    );
  }

  const safePageToken =
    typeof pageToken === 'string'
      ? pageToken.trim().slice(0, 200)
      : '';

  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    '?part=snippet' +
    `&q=${encodeURIComponent(query)}` +
    '&type=video' +
    '&maxResults=8' +
    '&order=relevance' +
    '&safeSearch=strict' +
    (
      safePageToken
        ? `&pageToken=${encodeURIComponent(safePageToken)}`
        : ''
    ) +
    `&key=${encodeURIComponent(
      YOUTUBE_API_KEY
    )}`;

  const data =
    await httpsGet(url);

  if (!Array.isArray(data?.items)) {
    return {
      items: [],
      nextPageToken: null,
    };
  }

  const items =
    data.items
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

  return {
    items,
    nextPageToken:
      typeof data?.nextPageToken ===
      'string'
        ? data.nextPageToken
        : null,
  };
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
      const articlePage =
        Math.min(
          Math.max(
            Number(req.query.articlePage) || 1,
            1
          ),
          20
        );

      const videoPageToken =
        typeof req.query.videoPageToken === 'string'
          ? req.query.videoPageToken
              .trim()
              .slice(0, 200)
          : '';

      const content =
        req.query.content === 'articles' ||
        req.query.content === 'videos'
          ? req.query.content
          : 'all';

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

      const wantsArticles =
        content !== 'videos';

      const wantsVideos =
        content !== 'articles';

      const results =
        await Promise.allSettled([
          wantsArticles
            ? fetchNews(
                recommendation.query,
                recommendation.category,
                articlePage
              )
            : Promise.resolve({
                items: [],
                page: articlePage,
                hasMore: false,
              }),

          wantsVideos
            ? fetchVideos(
                recommendation.query,
                recommendation.category,
                videoPageToken
              )
            : Promise.resolve({
                items: [],
                nextPageToken: null,
              }),
        ]);

      const articleResult =
        results[0].status === 'fulfilled'
          ? results[0].value
          : {
              items: [],
              page: articlePage,
              hasMore: false,
            };

      const videoResult =
        results[1].status === 'fulfilled'
          ? results[1].value
          : {
              items: [],
              nextPageToken: null,
            };

      if (
        wantsArticles &&
        results[0].status === 'rejected'
      ) {
        console.error(
          'Personalized news error:',
          results[0].reason
            ?.message
        );
      }

      if (
        wantsVideos &&
        results[1].status === 'rejected'
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

        articles:
          articleResult.items,

        videos:
          videoResult.items,

        pagination: {
          articles: {
            page:
              articleResult.page,
            hasMore:
              articleResult.hasMore,
          },

          videos: {
            nextPageToken:
              videoResult.nextPageToken,
            hasMore:
              Boolean(
                videoResult.nextPageToken
              ),
          },
        },
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

      const page =
        Math.min(
          Math.max(
            Number(req.query.page) || 1,
            1
          ),
          20
        );

      const query =
        search ||
        CAT_QUERIES[category] ||
        CAT_QUERIES['For You'];

      const result =
        await fetchNews(
          query,
          category || 'Health',
          page
        );

      const hasLiveArticles =
        Array.isArray(result.items) &&
        result.items.length > 0;

      return res.json({
        success: true,
        data:
          hasLiveArticles
            ? result.items
            : page === 1
              ? FALLBACK_ARTICLES
              : [],
        fallback:
          !hasLiveArticles &&
          page === 1,
        pagination: {
          page: result.page,
          hasMore:
            hasLiveArticles
              ? result.hasMore
              : false,
        },
      });
    } catch (error) {
      console.error(
        'News API error:',
        error.message
      );

      const page =
        Math.max(
          Number(req.query.page) || 1,
          1
        );

      return res.json({
        success: true,
        data:
          page === 1
            ? FALLBACK_ARTICLES
            : [],
        fallback: page === 1,
        pagination: {
          page,
          hasMore: false,
        },
        message:
          'Showing curated health articles while live news is unavailable',
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

      const pageToken =
        typeof req.query.pageToken ===
        'string'
          ? req.query.pageToken
              .trim()
              .slice(0, 200)
          : '';

      const query =
        CAT_QUERIES[category] ||
        CAT_QUERIES['For You'];

      const result =
        await fetchVideos(
          query,
          category || 'Health',
          pageToken
        );

      const hasLiveVideos =
        Array.isArray(result.items) &&
        result.items.length > 0;

      return res.json({
        success: true,
        data:
          hasLiveVideos
            ? result.items
            : !pageToken
              ? FALLBACK_VIDEOS
              : [],
        fallback:
          !hasLiveVideos &&
          !pageToken,
        pagination: {
          nextPageToken:
            hasLiveVideos
              ? result.nextPageToken
              : null,
          hasMore:
            hasLiveVideos &&
            Boolean(
              result.nextPageToken
            ),
        },
      });
    } catch (error) {
      console.error(
        'YouTube API error:',
        error.message
      );

      const hasToken =
        typeof req.query.pageToken ===
          'string' &&
        req.query.pageToken.trim();

      return res.json({
        success: true,
        data:
          hasToken
            ? []
            : FALLBACK_VIDEOS,
        fallback: !hasToken,
        pagination: {
          nextPageToken: null,
          hasMore: false,
        },
        message:
          'Showing curated videos while YouTube search is unavailable',
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