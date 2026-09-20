const rateLimit = require('express-rate-limit');

// ✅ Global rate limiter - 100 requests per 15 minutes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health check
    return req.path === '/health';
  },
});

// ✅ Strict limiter - 5 requests per 15 minutes (Login/Signup)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 attempts
  message: 'Too many login attempts, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by email instead of IP (more effective for login)
    return req.body?.email || req.ip;
  },
  skip: (req) => {
    // Don't rate limit if email is not provided
    return !req.body?.email;
  },
});

// ✅ Moderate limiter - 20 requests per 15 minutes (AI endpoints)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit to 20 requests
  message: 'Too many AI requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip if no auth token
    return !req.headers.authorization;
  },
});

// ✅ Scan limiter - 30 requests per hour (Food scanning)
const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // Limit to 30 scans per hour
  message: 'Too many scans, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip if no auth token
    return !req.headers.authorization;
  },
});

// ✅ API limiter - 50 requests per 15 minutes (General API)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  globalLimiter,
  authLimiter,
  aiLimiter,
  scanLimiter,
  apiLimiter,
};