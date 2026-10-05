const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Common JSON response
const rateLimitHandler = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    error: message,
  });
};

// 🌍 Global limiter
// 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,

  standardHeaders: true,
  legacyHeaders: false,

  skip: (req) => req.path === '/health',

  handler: rateLimitHandler(
    'Too many requests. Please try again later.'
  ),
});

// 🔐 Login / Register limiter
// 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    const email = req.body?.email;

    if (typeof email === 'string' && email.trim()) {
      return `email:${email.trim().toLowerCase()}`;
    }

    return `ip:${ipKeyGenerator(req.ip)}`;
  },

  handler: rateLimitHandler(
    'Too many login or signup attempts. Please try again after 15 minutes.'
  ),
});

// 🤖 AI limiter
// Protects Groq / USDA usage
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,

  standardHeaders: true,
  legacyHeaders: false,

  handler: rateLimitHandler(
    'Too many AI requests. Please try again later.'
  ),
});

// 📷 Food scan limiter
// 30 scan-related requests per hour
const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,

  standardHeaders: true,
  legacyHeaders: false,

  handler: rateLimitHandler(
    'Too many food scan requests. Please try again later.'
  ),
});

// 📦 General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,

  standardHeaders: true,
  legacyHeaders: false,

  handler: rateLimitHandler(
    'Too many API requests. Please try again later.'
  ),
});

module.exports = {
  globalLimiter,
  authLimiter,
  aiLimiter,
  scanLimiter,
  apiLimiter,
};