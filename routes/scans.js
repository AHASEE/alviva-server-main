const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const verifyToken = require('./middleware/verifyToken');
const { scanLimiter } = require('./middleware/rateLimit');

const {
  getTimezone,
  getUtcDayRange,
} = require('./utils/timezone');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─────────────────────────────────────
// POST /api/scans
// Save food scan
// ─────────────────────────────────────

router.post(
  '/',
  verifyToken,
  scanLimiter,
  async (req, res) => {
    try {
      const {
        food_name,
        calories,
        protein = 0,
        carbs = 0,
        fat = 0,
        fiber = 0,
        serving_size = 'Standard serving',
      } = req.body;

      // Food name validation
      if (
        typeof food_name !== 'string' ||
        !food_name.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: 'Food name is required',
        });
      }

      const cleanFoodName = food_name
        .trim()
        .slice(0, 100);

      // Nutrition values
      const nutrition = {
        calories: Number(calories),
        protein: Number(protein),
        carbs: Number(carbs),
        fat: Number(fat),
        fiber: Number(fiber),
      };

      if (
        !Number.isFinite(nutrition.calories) ||
        nutrition.calories < 0 ||
        nutrition.calories > 10000
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid calorie value',
        });
      }

      const macroFields = [
        'protein',
        'carbs',
        'fat',
        'fiber',
      ];

      for (const field of macroFields) {
        if (
          !Number.isFinite(nutrition[field]) ||
          nutrition[field] < 0 ||
          nutrition[field] > 2000
        ) {
          return res.status(400).json({
            success: false,
            error: `Invalid ${field} value`,
          });
        }
      }

      const cleanServingSize =
        typeof serving_size === 'string'
          ? serving_size.trim().slice(0, 100)
          : 'Standard serving';

      const { data, error } = await supabase
        .from('scans')
        .insert({
          user_id: req.user.id,

          food_name: cleanFoodName,

          calories: nutrition.calories,
          protein: nutrition.protein,
          carbs: nutrition.carbs,
          fat: nutrition.fat,
          fiber: nutrition.fiber,

          serving_size:
            cleanServingSize ||
            'Standard serving',
        })
        .select(
          `
          id,
          food_name,
          calories,
          protein,
          carbs,
          fat,
          fiber,
          serving_size,
          scanned_at
          `
        )
        .single();

      if (error) {
        console.error(
          'Save scan error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error: 'Unable to save scan',
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Scan saved successfully',
        scan: data,
      });
    } catch (error) {
      console.error(
        'Scan save error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to save scan',
      });
    }
  }
);

// ─────────────────────────────────────
// GET /api/scans/today
// ─────────────────────────────────────

router.get(
  '/today',
  verifyToken,
  async (req, res) => {
    try {
      const timezone =
        getTimezone(req);

      const {
        start,
        end,
      } = getUtcDayRange(
        timezone
      );

      const { data, error } =
        await supabase
          .from('scans')
          .select(
            `
            id,
            food_name,
            calories,
            protein,
            carbs,
            fat,
            fiber,
            serving_size,
            scanned_at
            `
          )
          .eq(
            'user_id',
            req.user.id
          )
          .gte(
            'scanned_at',
            start
          )
          .lt(
            'scanned_at',
            end
          )
          .order(
            'scanned_at',
            {
              ascending: false,
            }
          );

      if (error) {
        console.error(
          'Today scans error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load today scans',
        });
      }

      const scans =
        Array.isArray(data)
          ? data
          : [];

      const totalCalories =
        scans.reduce(
          (sum, scan) =>
            sum +
            (Number(scan.calories) || 0),
          0
        );

      return res.json({
        success: true,
        timezone,
        scans,
        totalCalories:
          Math.round(totalCalories),
      });
    } catch (error) {
      console.error(
        'Today scans error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to load today scans',
      });
    }
  }
);

// ─────────────────────────────────────
// GET /api/scans/history
// ─────────────────────────────────────

router.get(
  '/history',
  verifyToken,
  async (req, res) => {
    try {
      const { data, error } =
        await supabase
          .from('scans')
          .select(
            `
            id,
            food_name,
            calories,
            protein,
            carbs,
            fat,
            fiber,
            serving_size,
            scanned_at
            `
          )
          .eq(
            'user_id',
            req.user.id
          )
          .order(
            'scanned_at',
            {
              ascending: false,
            }
          )
          .limit(50);

      if (error) {
        console.error(
          'Scan history error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load scan history',
        });
      }

      return res.json({
        success: true,
        scans: data || [],
      });
    } catch (error) {
      console.error(
        'Scan history error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to load scan history',
      });
    }
  }
);

// ─────────────────────────────────────
// DELETE /api/scans/:id
// ─────────────────────────────────────

router.delete(
  '/:id',
  verifyToken,
  async (req, res) => {
    try {
      const scanId =
        String(req.params.id || '')
          .trim()
          .slice(0, 100);

      if (!scanId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid scan ID',
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from('scans')
        .delete()
        .eq('id', scanId)
        .eq(
          'user_id',
          req.user.id
        )
        .select('id');

      if (error) {
        console.error(
          'Delete scan error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error: 'Unable to delete scan',
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Scan not found',
        });
      }

      return res.json({
        success: true,
        message:
          'Scan deleted successfully',
      });
    } catch (error) {
      console.error(
        'Delete scan error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to delete scan',
      });
    }
  }
);

module.exports = router;