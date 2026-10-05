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

const calculateBMI = (weight, height) => {
  const weightNum = Number(weight);
  const heightNum = Number(height);

  if (
    !Number.isFinite(weightNum) ||
    !Number.isFinite(heightNum) ||
    weightNum <= 0 ||
    heightNum <= 0
  ) {
    return null;
  }

  const heightM = heightNum / 100;

  return (
    Math.round(
      (weightNum / (heightM * heightM)) * 10
    ) / 10
  );
};

const getBMICategory = (bmi) => {
  if (!Number.isFinite(bmi)) {
    return null;
  }

  if (bmi < 18.5) {
    return {
      category: 'Underweight',
      color: '#3b82f6',
      goal: 2500,
    };
  }

  if (bmi < 25) {
    return {
      category: 'Normal',
      color: '#22c55e',
      goal: 2000,
    };
  }

  if (bmi < 30) {
    return {
      category: 'Overweight',
      color: '#f59e0b',
      goal: 1700,
    };
  }

  return {
    category: 'Obese',
    color: '#ef4444',
    goal: 1500,
  };
};

const buildProfileResponse = (data) => {
  const bmi = calculateBMI(
    data?.weight,
    data?.height
  );

  const bmiInfo = getBMICategory(bmi);

  return {
    ...data,
    bmi,
    bmiCategory:
      bmiInfo?.category || null,
    bmiColor:
      bmiInfo?.color || null,
    suggestedGoal:
      bmiInfo?.goal || 2000,
  };
};

// ─────────────────────────────────────
// GET /api/profile
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
          id,
          name,
          email,
          age,
          weight,
          height,
          gender,
          activity_level,
          daily_goal,
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
          'Profile fetch error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error: 'Unable to load profile',
        });
      }

      return res.json({
        success: true,
        profile:
          buildProfileResponse(data),
      });
    } catch (error) {
      console.error(
        'Profile error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error: 'Unable to load profile',
      });
    }
  }
);

// ─────────────────────────────────────
// PUT /api/profile/update
// ─────────────────────────────────────

router.put(
  '/update',
  verifyToken,
  async (req, res) => {
    try {
      const {
        name,
        age,
        weight,
        height,
        gender,
        activity_level,
        daily_goal,
      } = req.body;

      const updates = {};

      // Name
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

      // Age
      if (age !== undefined) {
        const value = Number(age);

        if (
          !Number.isInteger(value) ||
          value < 13 ||
          value > 120
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Age must be between 13 and 120',
          });
        }

        updates.age = value;
      }

      // Weight in kg
      if (weight !== undefined) {
        const value = Number(weight);

        if (
          !Number.isFinite(value) ||
          value < 20 ||
          value > 500
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Weight must be between 20 and 500 kg',
          });
        }

        updates.weight = value;
      }

      // Height in cm
      if (height !== undefined) {
        const value = Number(height);

        if (
          !Number.isFinite(value) ||
          value < 80 ||
          value > 250
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Height must be between 80 and 250 cm',
          });
        }

        updates.height = value;
      }

      // Gender
      if (gender !== undefined) {
        const allowedGenders = [
          'male',
          'female',
          'other',
          'prefer_not_to_say',
        ];

        const value =
          String(gender)
            .trim()
            .toLowerCase();

        if (
          !allowedGenders.includes(value)
        ) {
          return res.status(400).json({
            success: false,
            error: 'Invalid gender value',
          });
        }

        updates.gender = value;
      }

      // Activity level
      if (
        activity_level !== undefined
      ) {
        const allowedLevels = [
          'sedentary',
          'light',
          'moderate',
          'active',
          'very_active',
        ];

        const value =
          String(activity_level)
            .trim()
            .toLowerCase();

        if (
          !allowedLevels.includes(value)
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Invalid activity level',
          });
        }

        updates.activity_level = value;
      }

      // Daily calorie goal
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

      if (
        Object.keys(updates).length === 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            'No valid profile fields provided',
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
          age,
          weight,
          height,
          gender,
          activity_level,
          daily_goal,
          current_streak,
          longest_streak,
          last_scan_date
          `
        )
        .single();

      if (error) {
        console.error(
          'Profile update error:',
          error.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to update profile',
        });
      }

      return res.json({
        success: true,
        message:
          'Profile updated successfully',
        profile:
          buildProfileResponse(data),
      });
    } catch (error) {
      console.error(
        'Profile update error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to update profile',
      });
    }
  }
);

module.exports = router;