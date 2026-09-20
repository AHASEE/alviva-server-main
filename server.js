const express = require('express');
const cors = require('cors');
require('dotenv').config();
const goalsRouter = require('./routes/goals');
const profileRouter = require('./routes/profile');
const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scans');
const articlesRouter = require('./routes/articles');
const aiRouter = require('./routes/ai');
const streakRouter = require('./routes/streak');
const waterRouter = require('./routes/water');

const app = express();

const allowedOrigins = [
  'https://alviva-server-main.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8081',
  'https://alviva-web.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.url} | Origin: ${req.headers.origin || 'none'}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/articles', articlesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/profile', profileRouter);
app.use('/api/streak', streakRouter);
app.use('/api/water', waterRouter);

app.get('/', (req, res) => {
  res.json({ 
    message: 'CalorieAI Backend Running! 🚀',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🌐 CORS Enabled for: ${allowedOrigins.join(', ')}`);
  console.log(`📦 Routes loaded: auth, scans, articles, goals, ai, profile, streak, water`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;