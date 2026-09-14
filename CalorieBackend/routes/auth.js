const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// SIGNUP
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true,
    });
    if (error) return res.status(400).json({ error: error.message });

    await supabase.from('profiles').insert({
      id: data.user.id,
      name,
      email,
      daily_goal: 2000,
    });

    res.json({ message: 'Account created successfully!', user: data.user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(400).json({ error: error.message });

    res.json({
      message: 'Login successful!',
      token: data.session.access_token,
      user: data.user,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;