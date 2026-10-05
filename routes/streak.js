const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const verifyToken = require('./middleware/verifyToken');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─────────────────────────────────────
// Helpers
// ─────────────────────────────────────

const getToday = () => {
  return new Date().toISOString().split('T')[0];
};

const getYesterday = () => {
  const date = new Date();

  date.setUTCDate(
    date.getUTCDate() - 1
  );

  return date
    .toISOString()
    .split('T')[0];
};

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 10);
};

const getMilestone = (streak) => {
  if (streak === 7) {
    return {
      badge: '🥉',
      message:
        "7 Day Streak! You're on fire! 🔥",
    };
  }

  if (streak === 30) {
    return {
      badge: '🥈',
      message:
        '30 Day Streak! Incredible dedication! 💪',
    };
  }

  if (streak === 100) {
    return {
      badge: '🥇',
      message:
        "100 Day Streak! You're a legend! 👑",
    };
  }

  return null;
};

// ─────────────────────────────────────
// GET /api/streak
// ─────────────────────────────────────

router.get(
  '/',
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
          current_streak,
          longest_streak,
          last_scan_date
          `
        )
        .eq(
          'id',
          req.user.id
        )
        .single();

      if (error) {
        console.error(
          'Streak fetch error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to load streak',
        });
      }

      const today = getToday();

      const lastScanDate =
        normalizeDate(
          data?.last_scan_date
        );

      const current =
        Math.max(
          Number(
            data?.current_streak
          ) || 0,
          0
        );

      const longest =
        Math.max(
          Number(
            data?.longest_streak
          ) || 0,
          0
        );

      return res.json({
        success: true,

        streak: {
          current,
          longest,

          isActiveToday:
            lastScanDate === today,
        },
      });
    } catch (error) {
      console.error(
        'Streak fetch error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to load streak',
      });
    }
  }
);

// ─────────────────────────────────────
// POST /api/streak/update
// ─────────────────────────────────────

router.post(
  '/update',
  verifyToken,
  async (req, res) => {
    try {
      const today = getToday();
      const yesterday =
        getYesterday();

      const {
        data: profile,
        error: fetchError,
      } = await supabase
        .from('profiles')
        .select(
          `
          current_streak,
          longest_streak,
          last_scan_date
          `
        )
        .eq(
          'id',
          req.user.id
        )
        .single();

      if (fetchError) {
        console.error(
          'Streak profile error:',
          fetchError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to update streak',
        });
      }

      const lastScanDate =
        normalizeDate(
          profile?.last_scan_date
        );

      let currentStreak =
        Math.max(
          Number(
            profile?.current_streak
          ) || 0,
          0
        );

      let longestStreak =
        Math.max(
          Number(
            profile?.longest_streak
          ) || 0,
          0
        );

      // Already counted today
      if (
        lastScanDate === today
      ) {
        return res.json({
          success: true,

          streak: {
            current:
              currentStreak,

            longest:
              longestStreak,

            isActiveToday: true,
          },

          milestone: null,
        });
      }

      // Continue or restart streak
      if (
        lastScanDate === yesterday
      ) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }

      longestStreak =
        Math.max(
          longestStreak,
          currentStreak
        );

      const {
        data: updated,
        error: updateError,
      } = await supabase
        .from('profiles')
        .update({
          current_streak:
            currentStreak,

          longest_streak:
            longestStreak,

          last_scan_date:
            today,
        })
        .eq(
          'id',
          req.user.id
        )
        .select(
          `
          current_streak,
          longest_streak,
          last_scan_date
          `
        )
        .single();

      if (updateError) {
        console.error(
          'Streak update error:',
          updateError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to update streak',
        });
      }

      const finalCurrent =
        Number(
          updated?.current_streak
        ) || currentStreak;

      const finalLongest =
        Number(
          updated?.longest_streak
        ) || longestStreak;

      return res.json({
        success: true,

        streak: {
          current:
            finalCurrent,

          longest:
            finalLongest,

          isActiveToday: true,
        },

        milestone:
          getMilestone(
            finalCurrent
          ),
      });
    } catch (error) {
      console.error(
        'Streak update error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to update streak',
      });
    }
  }
);

module.exports = router;