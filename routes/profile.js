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

// BMI Calculate
const calculateBMI = (weight, height) => {
  if (!weight || !height) return null;
  const heightM = height / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
};

// BMI Category
const getBMICategory = (bmi) => {
  if (!bmi) return null;
  if (bmi < 18.5) return { category: 'Underweight', color: '#3b82f6', goal: 2500 };
  if (bmi < 25)   return { category: 'Normal',      color: '#22c55e', goal: 2000 };
  if (bmi < 30)   return { category: 'Overweight',  color: '#f59e0b', goal: 1700 };
  return             { category: 'Obese',         color: '#ef4444', goal: 1500 };
};

// GET /api/profile
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const bmi = calculateBMI(data.weight, data.height);
    const bmiInfo = getBMICategory(bmi);

    res.json({
      success: true,
      profile: {
        ...data,
        bmi,
        bmiCategory: bmiInfo?.category || null,
        bmiColor: bmiInfo?.color || null,
        suggestedGoal: bmiInfo?.goal || 2000,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/profile/update
router.put('/update', verifyToken, async (req, res) => {
  const { name, age, weight, height, gender, activity_level, daily_goal } = req.body;
  try {
    const updates = {};
    if (name)           updates.name           = name;
    if (age)            updates.age            = age;
    if (weight)         updates.weight         = weight;
    if (height)         updates.height         = height;
    if (gender)         updates.gender         = gender;
    if (activity_level) updates.activity_level = activity_level;
    if (daily_goal)     updates.daily_goal     = daily_goal;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const bmi = calculateBMI(data.weight, data.height);
    const bmiInfo = getBMICategory(bmi);

    res.json({
      success: true,
      profile: {
        ...data,
        bmi,
        bmiCategory: bmiInfo?.category || null,
        bmiColor: bmiInfo?.color || null,
        suggestedGoal: bmiInfo?.goal || 2000,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;