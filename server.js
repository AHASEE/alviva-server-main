const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ─────────────────────────────────────
// Required environment variables
// Validate before importing route files,
// because route modules create Supabase clients.
// ─────────────────────────────────────

const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const goalsRouter = require('./routes/goals');
const profileRouter = require('./routes/profile');
const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scans');
const articlesRouter = require('./routes/articles');
const aiRouter = require('./routes/ai');
const streakRouter = require('./routes/streak');
const waterRouter = require('./routes/water');

const {
  globalLimiter,
} = require('./routes/middleware/rateLimit');

const app = express();

// Render / reverse proxy support
app.set('trust proxy', 1);

// Hide Express fingerprint
app.disable('x-powered-by');

// ─────────────────────────────────────
// CORS
// ─────────────────────────────────────

const allowedOrigins = [
  'https://alviva.app',
  'https://www.alviva.app',
  'https://alviva-web.vercel.app',

  // Local development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8081',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Mobile apps / Postman may send no Origin header
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn('Blocked CORS origin:', origin);

      const error = new Error('Not allowed by CORS');
      error.status = 403;

      return callback(error);
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

   allowedHeaders: [
  'Content-Type',
  'Authorization',
  'Accept',
  'X-Timezone',
],

    optionsSuccessStatus: 204,
  })
);

// ─────────────────────────────────────
// Body parsing
// ─────────────────────────────────────

// AI image Base64 requests need a larger JSON limit
app.use(
  express.json({
    limit: '10mb',
  })
);

// Forms do not need 10MB
app.use(
  express.urlencoded({
    extended: true,
    limit: '1mb',
  })
);

// ─────────────────────────────────────
// Health check
// ─────────────────────────────────────

app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────
// Global rate limit
// ─────────────────────────────────────

app.use(globalLimiter);

// ─────────────────────────────────────
// Request logging
// ─────────────────────────────────────

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────
// API routes
// ─────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/articles', articlesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/profile', profileRouter);
app.use('/api/streak', streakRouter);
app.use('/api/water', waterRouter);

// ─────────────────────────────────────
// Root
// ─────────────────────────────────────

app.get('/', (req, res) => {
  return res.json({
    success: true,
    message: 'Alviva API is running',
  });
});

// ─────────────────────────────────────
// 404
// ─────────────────────────────────────

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// ─────────────────────────────────────
// Global error handler
// ─────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);

  const status =
    Number.isInteger(err.status) &&
    err.status >= 400 &&
    err.status < 600
      ? err.status
      : 500;

  if (status === 403) {
    return res.status(403).json({
      success: false,
      error: 'Request origin is not allowed',
    });
  }

  return res.status(status).json({
    success: false,
    error:
      status === 500
        ? 'Internal server error'
        : err.message,
  });
});

// ─────────────────────────────────────
// Server
// ─────────────────────────────────────

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`✅ Alviva API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;