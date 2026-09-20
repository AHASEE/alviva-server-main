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

// GET /api/water - Get today's water intake
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(req.token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const today = new Date().toISOString().split('T')[0];

    // Get water intake for today
    const { data, error } = await supabase
      .from('water_intake')
      .select('id, cups, added_at')
      .eq('user_id', user.id)
      .gte('added_at', `${today}T00:00:00`)
      .lte('added_at', `${today}T23:59:59`)
      .order('added_at', { ascending: true });

    if (error) {
      console.error('Water fetch error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    const totalCups = data?.reduce((sum, item) => sum + (item.cups || 0), 0) || 0;
    const dailyGoal = 8; // 8 cups per day

    res.json({
      success: true,
      water: {
        totalCups,
        dailyGoal,
        progress: Math.min((totalCups / dailyGoal) * 100, 100),
        logs: data || [],
      },
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/water - Add water intake
router.post('/', verifyToken, async (req, res) => {
  try {
    const { cups = 1 } = req.body;

    if (!cups || cups < 0.5 || cups > 10) {
      return res.status(400).json({ success: false, error: 'Cups must be between 0.5 and 10' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(req.token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Insert water intake record
    const { data, error } = await supabase
      .from('water_intake')
      .insert([
        {
          user_id: user.id,
          cups,
          added_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      console.error('Water add error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    // Get updated totals for today
    const today = new Date().toISOString().split('T')[0];
    const { data: todayData } = await supabase
      .from('water_intake')
      .select('cups')
      .eq('user_id', user.id)
      .gte('added_at', `${today}T00:00:00`)
      .lte('added_at', `${today}T23:59:59`);

    const totalCups = todayData?.reduce((sum, item) => sum + (item.cups || 0), 0) || 0;
    const dailyGoal = 8;

    res.json({
      success: true,
      message: `Added ${cups} cup${cups !== 1 ? 's' : ''} of water!`,
      water: {
        totalCups,
        dailyGoal,
        progress: Math.min((totalCups / dailyGoal) * 100, 100),
      },
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;