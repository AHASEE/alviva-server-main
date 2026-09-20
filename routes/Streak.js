const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  req.token = token;
  next();
};

// GET /api/streak - Fetch current streak
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(req.token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Get streak data from profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, last_scan_date')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Streak fetch error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const today = new Date().toISOString().split('T')[0];
    const isActiveToday = data?.last_scan_date && data.last_scan_date.includes(today);

    res.json({
      success: true,
      streak: {
        current: data?.current_streak || 0,
        longest: data?.longest_streak || 0,
        isActiveToday: !!isActiveToday,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/streak/update - Update streak
router.post('/update', verifyToken, async (req, res) => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(req.token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const today = new Date().toISOString().split('T')[0];

    // Get current profile data
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, last_scan_date')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return res.status(500).json({ success: false, error: fetchError.message });
    }

    let newStreak = profile?.current_streak || 0;
    let newLongest = profile?.longest_streak || 0;

    // Check if logged today
    const lastDate = profile?.last_scan_date;
    if (lastDate && lastDate.includes(today)) {
      // Already logged today
      return res.json({
        success: true,
        streak: {
          current: newStreak,
          longest: newLongest,
          isActiveToday: true,
        },
      });
    }

    // Check if streak should continue
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate && lastDate.includes(yesterdayStr)) {
      // Continue streak
      newStreak += 1;
    } else if (!lastDate) {
      // First time
      newStreak = 1;
    } else {
      // Streak broken, start new
      newStreak = 1;
    }

    // Update longest streak
    if (newStreak > newLongest) {
      newLongest = newStreak;
    }

    // Update database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_scan_date: today,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ success: false, error: updateError.message });
    }

    // Check milestones
    let milestone = null;
    if (newStreak === 7) {
      milestone = { badge: '🥉', message: '7 Day Streak! You\'re on fire! 🔥' };
    } else if (newStreak === 30) {
      milestone = { badge: '🥈', message: '30 Day Streak! Incredible dedication! 💪' };
    } else if (newStreak === 100) {
      milestone = { badge: '🥇', message: '100 Day Streak! You\'re a legend! 👑' };
    }

    res.json({
      success: true,
      streak: {
        current: newStreak,
        longest: newLongest,
        isActiveToday: true,
      },
      milestone,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;