const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const verifyToken = require('./middleware/verifyToken');

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
// GET /api/goals/profile
// ─────────────────────────────────────

router.get(
  '/profile',
  verifyToken,
  async (req, res) => {
    try {
      const {
        data,
        error,
      } = await supabase
        .from('profiles')
        .select(
          `
          id,
          name,
          email,
          daily_goal
          `
        )
        .eq(
          'id',
          req.user.id
        )
        .single();

      if (error) {
        console.error(
          'Goal profile fetch error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load goal profile',
        });
      }

      return res.json({
        success: true,
        profile: data,
      });
    } catch (error) {
      console.error(
        'Goal profile error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to load goal profile',
      });
    }
  }
);

// ─────────────────────────────────────
// PUT /api/goals/update
// ─────────────────────────────────────

router.put(
  '/update',
  verifyToken,
  async (req, res) => {
    try {
      const {
        daily_goal,
        name,
      } = req.body;

      const updates = {};

      if (
        daily_goal !== undefined
      ) {
        const value =
          Number(daily_goal);

        if (
          !Number.isFinite(value) ||
          value < 800 ||
          value > 10000
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Daily goal must be between 800 and 10000 calories',
          });
        }

        updates.daily_goal =
          Math.round(value);
      }

      if (name !== undefined) {
        if (
          typeof name !== 'string' ||
          name.trim().length < 2 ||
          name.trim().length > 80
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Name must be between 2 and 80 characters',
          });
        }

        updates.name =
          name.trim();
      }

      if (
        Object.keys(updates).length === 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            'No valid fields provided',
        });
      }

      const {
        data,
        error,
      } = await supabase
        .from('profiles')
        .update(updates)
        .eq(
          'id',
          req.user.id
        )
        .select(
          `
          id,
          name,
          email,
          daily_goal
          `
        )
        .single();

      if (error) {
        console.error(
          'Goal update error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to update goal',
        });
      }

      return res.json({
        success: true,
        message:
          'Goal updated successfully',
        profile: data,
      });
    } catch (error) {
      console.error(
        'Goal update error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to update goal',
      });
    }
  }
);

// ─────────────────────────────────────
// GET /api/goals/stats
// ─────────────────────────────────────

router.get(
  '/stats',
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

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(
          'daily_goal, name'
        )
        .eq(
          'id',
          req.user.id
        )
        .single();

      if (profileError) {
        console.error(
          'Stats profile error:',
          profileError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load stats',
        });
      }

      const {
        data: scans,
        error: scansError,
      } = await supabase
        .from('scans')
        .select(
          `
          calories,
          protein,
          carbs,
          fat,
          fiber
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
        );

      if (scansError) {
        console.error(
          'Stats scans error:',
          scansError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load stats',
        });
      }

      const safeScans =
        Array.isArray(scans)
          ? scans
          : [];

      const sumField = (field) =>
        safeScans.reduce(
          (sum, scan) =>
            sum +
            (Number(
              scan?.[field]
            ) || 0),
          0
        );

      const totalCalories =
        sumField('calories');

      const totalProtein =
        sumField('protein');

      const totalCarbs =
        sumField('carbs');

      const totalFat =
        sumField('fat');

      const totalFiber =
        sumField('fiber');

      const dailyGoal =
        Number(
          profile?.daily_goal
        ) || 2000;

      const remaining =
        Math.max(
          dailyGoal -
            totalCalories,
          0
        );

      const progress =
        dailyGoal > 0
          ? Math.min(
              Math.round(
                (
                  totalCalories /
                  dailyGoal
                ) * 100
              ),
              100
            )
          : 0;

      return res.json({
        success: true,

        timezone,

        stats: {
          totalCalories:
            Math.round(
              totalCalories
            ),

          totalProtein:
            Math.round(
              totalProtein
            ),

          totalCarbs:
            Math.round(
              totalCarbs
            ),

          totalFat:
            Math.round(
              totalFat
            ),

          totalFiber:
            Math.round(
              totalFiber
            ),

          dailyGoal:
            Math.round(
              dailyGoal
            ),

          remaining:
            Math.round(
              remaining
            ),

          progress,

          name:
            profile?.name ||
            'User',

          scansCount:
            safeScans.length,
        },
      });
    } catch (error) {
      console.error(
        'Stats error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to load stats',
      });
    }
  }
);

module.exports = router;
