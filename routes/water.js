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

const DAILY_GOAL = 8;

// ─────────────────────────────────────
// Helper
// ─────────────────────────────────────

const buildWaterStats = (logs = []) => {
  const totalCups = logs.reduce(
    (sum, item) =>
      sum + (Number(item.cups) || 0),
    0
  );

  return {
    totalCups:
      Math.round(totalCups * 10) / 10,

    dailyGoal: DAILY_GOAL,

    progress: Math.min(
      Math.round(
        (totalCups / DAILY_GOAL) * 100
      ),
      100
    ),
  };
};

// ─────────────────────────────────────
// GET /api/water
// Today's water intake
// ─────────────────────────────────────

router.get(
  '/',
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
        data,
        error,
      } = await supabase
        .from('water_intake')
        .select(
          `
          id,
          cups,
          added_at
          `
        )
        .eq(
          'user_id',
          req.user.id
        )
        .gte(
          'added_at',
          start
        )
        .lt(
          'added_at',
          end
        )
        .order(
          'added_at',
          {
            ascending: true,
          }
        );

      if (error) {
        console.error(
          'Water fetch error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load water intake',
        });
      }

      const logs =
        Array.isArray(data)
          ? data
          : [];

      return res.json({
        success: true,

        timezone,

        water: {
          ...buildWaterStats(
            logs
          ),

          logs,
        },
      });
    } catch (error) {
      console.error(
        'Water fetch error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to load water intake',
      });
    }
  }
);

// ─────────────────────────────────────
// POST /api/water
// Add water intake
// ─────────────────────────────────────

router.post(
  '/',
  verifyToken,
  async (req, res) => {
    try {
      const timezone =
        getTimezone(req);

      const cups =
        req.body?.cups === undefined
          ? 1
          : Number(
              req.body.cups
            );

      if (
        !Number.isFinite(cups) ||
        cups < 0.5 ||
        cups > 10
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Cups must be between 0.5 and 10',
        });
      }

      const {
        data: inserted,
        error: insertError,
      } = await supabase
        .from('water_intake')
        .insert({
          user_id:
            req.user.id,

          cups,

          added_at:
            new Date()
              .toISOString(),
        })
        .select(
          `
          id,
          cups,
          added_at
          `
        )
        .single();

      if (insertError) {
        console.error(
          'Water insert error:',
          insertError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to add water intake',
        });
      }

      const {
        start,
        end,
      } = getUtcDayRange(
        timezone
      );

      const {
        data: todayData,
        error: totalsError,
      } = await supabase
        .from('water_intake')
        .select(
          'cups'
        )
        .eq(
          'user_id',
          req.user.id
        )
        .gte(
          'added_at',
          start
        )
        .lt(
          'added_at',
          end
        );

      if (totalsError) {
        console.error(
          'Water totals error:',
          totalsError.message
        );
      }

      const stats =
        buildWaterStats(
          todayData || []
        );

      return res.status(201).json({
        success: true,

        message:
          'Water intake added successfully',

        timezone,

        entry: inserted,

        water: stats,
      });
    } catch (error) {
      console.error(
        'Water add error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to add water intake',
      });
    }
  }
);

// ─────────────────────────────────────
// DELETE /api/water/latest
// Delete latest entry for local day
// ─────────────────────────────────────

router.delete(
  '/latest',
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
        data: latest,
        error: findError,
      } = await supabase
        .from('water_intake')
        .select(
          `
          id,
          cups,
          added_at
          `
        )
        .eq(
          'user_id',
          req.user.id
        )
        .gte(
          'added_at',
          start
        )
        .lt(
          'added_at',
          end
        )
        .order(
          'added_at',
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error(
          'Water latest error:',
          findError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to remove water entry',
        });
      }

      if (!latest) {
        return res.status(404).json({
          success: false,
          error:
            'No water entry to remove',
        });
      }

      const {
        error: deleteError,
      } = await supabase
        .from('water_intake')
        .delete()
        .eq(
          'id',
          latest.id
        )
        .eq(
          'user_id',
          req.user.id
        );

      if (deleteError) {
        console.error(
          'Water delete error:',
          deleteError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to remove water entry',
        });
      }

      const {
        data: remaining,
        error: totalsError,
      } = await supabase
        .from('water_intake')
        .select(
          'cups'
        )
        .eq(
          'user_id',
          req.user.id
        )
        .gte(
          'added_at',
          start
        )
        .lt(
          'added_at',
          end
        );

      if (totalsError) {
        console.error(
          'Water totals error:',
          totalsError.message
        );
      }

      return res.json({
        success: true,

        message:
          'Last water entry removed',

        timezone,

        water:
          buildWaterStats(
            remaining || []
          ),
      });
    } catch (error) {
      console.error(
        'Water delete error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to remove water entry',
      });
    }
  }
);

module.exports = router;