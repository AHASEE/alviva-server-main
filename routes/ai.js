const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const verifyToken = require('./middleware/verifyToken');
const { aiLimiter } = require('./middleware/rateLimit');
const { getTimezone } = require('./utils/timezone');
const { getDailyScanUsage } = require('./utils/scanQuota');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const USDA_API_KEY = process.env.USDA_API_KEY;

// Maximum base64 image size
const MAX_IMAGE_LENGTH = 8_000_000;

function isValidNutrition(nutrition) {
  if (!nutrition) {
    return false;
  }

  const calories =
    Number(nutrition.totalCalories);

  if (
    !Number.isFinite(calories) ||
    calories <= 0 ||
    calories > 10000
  ) {
    return false;
  }

  for (const field of [
    'protein',
    'carbs',
    'fat',
    'fiber',
  ]) {
    const value =
      Number(nutrition[field]);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 2000
    ) {
      return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────
// POST /api/ai/identify
// ─────────────────────────────────────────────
router.post(
  '/identify',
  verifyToken,
  aiLimiter,
  async (req, res) => {
    try {
      const timezone =
        getTimezone(req);

      const quota =
        await getDailyScanUsage(
          supabase,
          req.user.id,
          timezone
        );

      if (quota.remaining <= 0) {
        return res.status(429).json({
          success: false,
          code: 'DAILY_SCAN_LIMIT_REACHED',
          error:
            'You have used all 5 free scans for today. Your free scan allowance resets tomorrow.',
          quota,
        });
      }

      if (!GROQ_API_KEY) {
        console.error('GROQ_API_KEY is missing');

        return res.status(503).json({
          success: false,
          error: 'AI service is temporarily unavailable',
        });
      }

      const { imageBase64 } = req.body;

      if (
        !imageBase64 ||
        typeof imageBase64 !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          error: 'Valid image is required',
        });
      }

      if (imageBase64.length > MAX_IMAGE_LENGTH) {
        return res.status(413).json({
          success: false,
          error: 'Image is too large',
        });
      }

      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },

          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',

            messages: [
              {
                role: 'user',

                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${imageBase64}`,
                    },
                  },

                  {
                    type: 'text',
                    text:
                      'Identify the primary food dish in this image. ' +
                      'Return ONLY the food name, nothing else. ' +
                      'Be specific. Example: "Chicken Biryani" or "Chocolate Cake".',
                  },
                ],
              },
            ],

            temperature: 0.1,
            max_tokens: 50,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(
          'Groq identify error:',
          data?.error?.message || response.status
        );

        return res.status(502).json({
          success: false,
          error: 'Unable to identify food right now',
        });
      }

      const foodName =
        data?.choices?.[0]?.message?.content?.trim();

      if (!foodName) {
        return res.status(422).json({
          success: false,
          error: 'Could not identify food',
        });
      }

      return res.json({
        success: true,
        foodName,
        quota,
      });
    } catch (error) {
      console.error(
        'Identify error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to identify food',
      });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/ai/nutrition
// ─────────────────────────────────────────────
router.post(
  '/nutrition',
  verifyToken,
  aiLimiter,
  async (req, res) => {
    try {
      const { foodName } = req.body;

      if (
        typeof foodName !== 'string' ||
        !foodName.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: 'Food name is required',
        });
      }

      const cleanFoodName = foodName
        .trim()
        .slice(0, 100);

      const normalizedName =
        cleanFoodName.toLowerCase();

      // ─────────────────────────────────
      // STEP 1: Cache
      // ─────────────────────────────────

      const {
        data: cached,
        error: cacheError,
      } = await supabase
        .from('food_cache')
        .select('*')
        .eq('food_name', normalizedName)
        .maybeSingle();

      if (cacheError) {
        console.error(
          'Food cache lookup error:',
          cacheError.message
        );
      }

      if (cached) {
        const cachedNutrition = {
          foodName: cached.food_name,
          totalCalories: cached.calories,
          protein: cached.protein,
          carbs: cached.carbs,
          fat: cached.fat,
          fiber: cached.fiber,
          servingSize: cached.serving_size,
        };

        if (isValidNutrition(cachedNutrition)) {
          await supabase
            .from('food_cache')
            .update({
              hit_count:
                (cached.hit_count || 0) + 1,
            })
            .eq('id', cached.id);

          return res.json({
            success: true,
            source: 'cache',
            nutrition: cachedNutrition,
          });
        }

        console.warn(
          'Ignoring invalid cached nutrition for:',
          normalizedName
        );
      }

      let nutrition = null;

      // ─────────────────────────────────
      // STEP 2: USDA
      // ─────────────────────────────────

      if (USDA_API_KEY) {
        try {
          const usdaURL =
            `https://api.nal.usda.gov/fdc/v1/foods/search` +
            `?query=${encodeURIComponent(cleanFoodName)}` +
            `&pageSize=1` +
            `&api_key=${encodeURIComponent(USDA_API_KEY)}`;

          const usdaResponse =
            await fetch(usdaURL);

          if (usdaResponse.ok) {
            const usdaData =
              await usdaResponse.json();

            const food =
              usdaData?.foods?.[0];

            let calories = 0;
            let protein = 0;
            let carbs = 0;
            let fat = 0;
            let fiber = 0;

            if (
              Array.isArray(food?.foodNutrients)
            ) {
              for (
                const nutrient of food.foodNutrients
              ) {
                const value =
                  Number(nutrient.value) || 0;

                if (
                  nutrient.nutrientName?.includes(
                    'Energy'
                  ) &&
                  nutrient.unitName === 'KCAL'
                ) {
                  calories = value;
                }

                if (
                  nutrient.nutrientName?.includes(
                    'Protein'
                  )
                ) {
                  protein = value;
                }

                if (
                  nutrient.nutrientName?.includes(
                    'Carbohydrate'
                  )
                ) {
                  carbs = value;
                }

                if (
                  nutrient.nutrientName?.includes(
                    'Total lipid'
                  )
                ) {
                  fat = value;
                }

                if (
                  nutrient.nutrientName?.includes(
                    'Fiber'
                  )
                ) {
                  fiber = value;
                }
              }
            }

            if (calories > 0) {
              nutrition = {
                foodName: cleanFoodName,
                totalCalories:
                  Math.round(calories),

                protein:
                  Math.round(protein),

                carbs:
                  Math.round(carbs),

                fat:
                  Math.round(fat),

                fiber:
                  Math.round(fiber),

                servingSize: '100g',
                source: 'usda',
              };
            }
          }
        } catch (error) {
          console.error(
            'USDA request failed:',
            error.message
          );
        }
      }

      // ─────────────────────────────────
      // STEP 3: Groq fallback
      // ─────────────────────────────────

      if (!nutrition) {
        if (!GROQ_API_KEY) {
          console.error(
            'GROQ_API_KEY is missing'
          );

          return res.status(503).json({
            success: false,
            error:
              'Nutrition service is temporarily unavailable',
          });
        }

        const groqResponse = await fetch(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${GROQ_API_KEY}`,
            },

            body: JSON.stringify({
              model:
                'meta-llama/llama-4-scout-17b-16e-instruct',

              messages: [
                {
                  role: 'user',

                  content:
                    `Give estimated nutrition information for the food "${cleanFoodName}". ` +
                    `Return ONLY valid JSON with this structure: ` +
                    `{"foodName":"${cleanFoodName}",` +
                    `"totalCalories":number,` +
                    `"protein":number,` +
                    `"carbs":number,` +
                    `"fat":number,` +
                    `"fiber":number,` +
                    `"servingSize":"string"}.`,
                },
              ],

              temperature: 0.1,
              max_tokens: 200,
            }),
          }
        );

        const groqData =
          await groqResponse.json();

        if (!groqResponse.ok) {
          console.error(
            'Groq nutrition error:',
            groqData?.error?.message ||
              groqResponse.status
          );

          return res.status(502).json({
            success: false,
            error:
              'Unable to retrieve nutrition data',
          });
        }

        const rawText =
          groqData?.choices?.[0]?.message
            ?.content || '';

        let parsed;

        try {
          parsed = JSON.parse(
            rawText
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim()
          );
        } catch {
          console.error(
            'Invalid AI nutrition JSON'
          );

          return res.status(502).json({
            success: false,
            error:
              'Invalid nutrition response',
          });
        }

        nutrition = {
          foodName: cleanFoodName,

          totalCalories:
            Number(parsed.totalCalories) || 0,

          protein:
            Number(parsed.protein) || 0,

          carbs:
            Number(parsed.carbs) || 0,

          fat:
            Number(parsed.fat) || 0,

          fiber:
            Number(parsed.fiber) || 0,

          servingSize:
            typeof parsed.servingSize ===
            'string'
              ? parsed.servingSize.slice(0, 50)
              : 'Standard serving',

          source: 'groq',
        };
      }

      if (!isValidNutrition(nutrition)) {
        console.error(
          'Invalid nutrition values for:',
          cleanFoodName
        );

        return res.status(502).json({
          success: false,
          error:
            'Nutrition data could not be verified. Please try again.',
        });
      }

      nutrition = {
        ...nutrition,
        totalCalories:
          Math.round(Number(nutrition.totalCalories)),
        protein:
          Math.round(Number(nutrition.protein)),
        carbs:
          Math.round(Number(nutrition.carbs)),
        fat:
          Math.round(Number(nutrition.fat)),
        fiber:
          Math.round(Number(nutrition.fiber)),
      };

      // ─────────────────────────────────
      // STEP 4: Cache result
      // ─────────────────────────────────

      const { error: saveError } =
        await supabase
          .from('food_cache')
          .upsert(
            {
              food_name: normalizedName,

              calories:
                nutrition.totalCalories,

              protein:
                nutrition.protein,

              carbs:
                nutrition.carbs,

              fat:
                nutrition.fat,

              fiber:
                nutrition.fiber,

              serving_size:
                nutrition.servingSize,

              source:
                nutrition.source,

              hit_count: 1,
            },

            {
              onConflict: 'food_name',
            }
          );

      if (saveError) {
        console.error(
          'Cache save error:',
          saveError.message
        );
      }

      return res.json({
        success: true,
        source: nutrition.source,
        nutrition,
      });
    } catch (error) {
      console.error(
        'Nutrition error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to retrieve nutrition data',
      });
    }
  }
);

module.exports = router;