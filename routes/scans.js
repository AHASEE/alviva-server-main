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

// POST /api/scans — Save scan
router.post('/', verifyToken, async (req, res) => {
  const { food_name, calories, protein, carbs, fat, fiber, serving_size } = req.body;
  try {
    const { data, error } = await supabase.from('scans').insert({
      user_id: req.user.id,
      food_name,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      serving_size,
    }).select();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Scan saved successfully!', scan: data[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scans/today
router.get('/today', verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('scanned_at', `${today}T00:00:00`)
      .lte('scanned_at', `${today}T23:59:59`)
      .order('scanned_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    const totalCalories = data.reduce((sum, s) => sum + s.calories, 0);
    res.json({ scans: data, totalCalories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scans/history
router.get('/history', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', req.user.id)
      .order('scanned_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ scans: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/scans/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scans')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Scan deleted successfully!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;