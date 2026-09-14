const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const USDA_API_KEY = process.env.USDA_API_KEY;

// ── POST /api/ai/identify ─────────────────────────────────
router.post('/identify', async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ success: false, error: 'Image not found!' });

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            { type: 'text', text: 'Identify the primary food dish in this image. Return ONLY the food name, nothing else. Be specific. Example: "Chicken Biryani" or "Chocolate Cake".' },
          ],
        }],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq error:', data);
      return res.status(400).json({ success: false, error: data?.error?.message || 'Groq API error' });
    }

    const foodName = data.choices?.[0]?.message?.content?.trim() || '';
    if (!foodName) return res.status(400).json({ success: false, error: 'Could not identify food' });

    console.log(`✅ Food identified: ${foodName}`);
    res.json({ success: true, foodName });

  } catch (e) {
    console.error('Identify error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/ai/nutrition ────────────────────────────────
router.post('/nutrition', async (req, res) => {
  const { foodName } = req.body;
  if (!foodName) return res.status(400).json({ success: false, error: 'Food name is required!' });

  const normalizedName = foodName.toLowerCase().trim();

  try {
    // ── STEP 1: Cache check ───────────────────────────────
    const { data: cached } = await supabase
      .from('food_cache')
      .select('*')
      .ilike('food_name', normalizedName)
      .single();

    if (cached) {
      console.log(`✅ Cache hit: ${foodName}`);
      await supabase
        .from('food_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id);

      return res.json({
        success: true,
        source: 'cache',
        nutrition: {
          foodName: cached.food_name,
          totalCalories: cached.calories,
          protein: cached.protein,
          carbs: cached.carbs,
          fat: cached.fat,
          fiber: cached.fiber,
          servingSize: cached.serving_size,
        },
      });
    }

    console.log(`❌ Cache miss: ${foodName} — fetching from API...`);

    // ── STEP 2: USDA check ────────────────────────────────
    let nutrition = null;

    try {
      const usdaRes = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(foodName)}&pageSize=1&api_key=${USDA_API_KEY}`
      );
      const usdaData = await usdaRes.json();
      const food = usdaData.foods?.[0];

      let calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;

      if (food?.foodNutrients) {
        for (const n of food.foodNutrients) {
          const v = n.value ?? 0;
          if (n.nutrientName?.includes('Energy') && n.unitName === 'KCAL') calories = v;
          if (n.nutrientName?.includes('Protein'))                          protein  = v;
          if (n.nutrientName?.includes('Carbohydrate'))                     carbs    = v;
          if (n.nutrientName?.includes('Total lipid'))                      fat      = v;
          if (n.nutrientName?.includes('Fiber'))                            fiber    = v;
        }
      }

      if (calories > 0) {
        nutrition = {
          foodName,
          totalCalories: Math.round(calories),
          protein:       Math.round(protein),
          carbs:         Math.round(carbs),
          fat:           Math.round(fat),
          fiber:         Math.round(fiber),
          servingSize:   '100g',
          source:        'usda',
        };
        console.log(`✅ USDA found: ${foodName} — ${Math.round(calories)} kcal`);
      }
    } catch (usdaErr) {
      console.log('USDA failed, falling back to Groq...');
    }

    // ── STEP 3: Groq fallback ─────────────────────────────
    if (!nutrition) {
      console.log(`🤖 Groq fallback for: ${foodName}`);
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: `Give accurate nutrition for "${foodName}" per standard serving. Reply ONLY with valid JSON, no markdown:\n{"foodName":"${foodName}","totalCalories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"servingSize":"string"}`,
          }],
          temperature: 0.1,
          max_tokens: 200,
        }),
      });

      const groqData = await groqRes.json();

      if (!groqRes.ok) {
        console.error('Groq fallback error:', groqData);
        return res.status(400).json({ success: false, error: groqData?.error?.message || 'Groq API error' });
      }

      const rawText = groqData.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());

      nutrition = {
        foodName,
        totalCalories: parsed.totalCalories,
        protein:       parsed.protein,
        carbs:         parsed.carbs,
        fat:           parsed.fat,
        fiber:         parsed.fiber,
        servingSize:   parsed.servingSize,
        source:        'groq',
      };
    }

    // ── STEP 4: Save to cache ─────────────────────────────
    await supabase.from('food_cache').upsert({
      food_name:    normalizedName,
      calories:     nutrition.totalCalories,
      protein:      nutrition.protein,
      carbs:        nutrition.carbs,
      fat:          nutrition.fat,
      fiber:        nutrition.fiber,
      serving_size: nutrition.servingSize,
      source:       nutrition.source,
      hit_count:    1,
    }, { onConflict: 'food_name' });

    console.log(`💾 Saved to cache: ${foodName}`);

    res.json({ success: true, source: nutrition.source, nutrition });

  } catch (e) {
    console.error('Nutrition error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;