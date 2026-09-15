const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Token verify middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token not found!' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: 'Invalid token!' });
  req.user = data.user;
  next();
};

// GET /api/goals/profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, profile: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/goals/update
router.put('/update', verifyToken, async (req, res) => {
  const { daily_goal, name } = req.body;
  try {
    const updates = {};
    if (daily_goal) updates.daily_goal = daily_goal;
    if (name) updates.name = name;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, profile: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/goals/stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('daily_goal, name')
      .eq('id', req.user.id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    const { data: scans } = await supabase
      .from('scans')
      .select('calories, protein, carbs, fat, fiber')
      .eq('user_id', req.user.id)
      .gte('scanned_at', `${today}T00:00:00`)
      .lte('scanned_at', `${today}T23:59:59`);

    const totalCalories = scans?.reduce((sum, s) => sum + (s.calories || 0), 0) || 0;
    const totalProtein  = scans?.reduce((sum, s) => sum + (s.protein  || 0), 0) || 0;
    const totalCarbs    = scans?.reduce((sum, s) => sum + (s.carbs    || 0), 0) || 0;
    const totalFat      = scans?.reduce((sum, s) => sum + (s.fat      || 0), 0) || 0;
    const totalFiber    = scans?.reduce((sum, s) => sum + (s.fiber    || 0), 0) || 0;
    const dailyGoal     = profile?.daily_goal || 2000;
    const remaining     = Math.max(dailyGoal - totalCalories, 0);
    const progress      = Math.min(Math.round((totalCalories / dailyGoal) * 100), 100);

    res.json({
      success: true,
      stats: {
        totalCalories,
        totalProtein:  Math.round(totalProtein),
        totalCarbs:    Math.round(totalCarbs),
        totalFat:      Math.round(totalFat),
        totalFiber:    Math.round(totalFiber),
        dailyGoal,
        remaining,
        progress,
        name: profile?.name || 'User',
        scansCount: scans?.length || 0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;