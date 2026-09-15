const express = require('express');
const cors = require('cors');
require('dotenv').config();
const goalsRouter = require('./routes/goals');
const profileRouter = require('./routes/profile');

const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scans');
const articlesRouter = require('./routes/articles');
const aiRouter = require('./routes/ai');


const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/articles', articlesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/profile', profileRouter);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'CalorieAI Backend Running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});