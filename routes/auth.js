const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const { authLimiter } = require('./middleware/rateLimit');
const verifyToken = require('./middleware/verifyToken');

const router = express.Router();

// Public/auth client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client - backend only
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────

router.post(
  '/register',
  authLimiter,
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
      } = req.body;

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

      const cleanEmail =
        typeof email === 'string'
          ? email.trim().toLowerCase()
          : '';

      if (
        !EMAIL_REGEX.test(cleanEmail)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Please enter a valid email address',
        });
      }

      if (
        typeof password !== 'string' ||
        password.length < 8 ||
        password.length > 128
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Password must be between 8 and 128 characters',
        });
      }

      const {
        data,
        error,
      } = await supabase.auth.signUp({
        email: cleanEmail,
        password,

        options: {
          data: {
            name: name.trim(),
          },
        },
      });

      if (error) {
        console.error(
          'Signup error:',
          error.message
        );

        return res.status(400).json({
          success: false,
          error:
            'Unable to create account',
        });
      }

      if (!data?.user) {
        return res.status(400).json({
          success: false,
          error:
            'Unable to create account',
        });
      }

      const {
        error: profileError,
      } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: data.user.id,
          name: name.trim(),
          email: cleanEmail,
          daily_goal: 2000,
        });

      if (profileError) {
        console.error(
          'Profile creation error:',
          profileError.message
        );

        // Cleanup auth user if profile creation fails
        try {
          await supabaseAdmin
            .auth
            .admin
            .deleteUser(
              data.user.id
            );
        } catch (cleanupError) {
          console.error(
            'Signup cleanup error:',
            cleanupError.message
          );
        }

        return res.status(500).json({
          success: false,
          error:
            'Unable to complete account setup',
        });
      }

      return res.status(201).json({
        success: true,

        message:
          data.session
            ? 'Account created successfully'
            : 'Account created. Please verify your email before logging in.',

        requiresEmailVerification:
          !data.session,
      });
    } catch (error) {
      console.error(
        'Register error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to create account',
      });
    }
  }
);

// ─────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────

router.post(
  '/login',
  authLimiter,
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      const cleanEmail =
        typeof email === 'string'
          ? email.trim().toLowerCase()
          : '';

      if (
        !EMAIL_REGEX.test(cleanEmail) ||
        typeof password !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid email or password',
        });
      }

      const {
        data,
        error,
      } =
        await supabase.auth
          .signInWithPassword({
            email: cleanEmail,
            password,
          });

      if (error) {
        console.error(
          'Login error:',
          error.message
        );

        if (
          error.message
            ?.toLowerCase()
            .includes(
              'email not confirmed'
            )
        ) {
          return res.status(403).json({
            success: false,
            error:
              'Please verify your email before logging in',
          });
        }

        return res.status(401).json({
          success: false,
          error:
            'Invalid email or password',
        });
      }

      if (
        !data?.session ||
        !data?.user
      ) {
        return res.status(401).json({
          success: false,
          error:
            'Invalid email or password',
        });
      }

      return res.json({
        success: true,

        message:
          'Login successful',

        token:
          data.session.access_token,

        user: {
          id:
            data.user.id,

          email:
            data.user.email,

          name:
            data.user
              .user_metadata
              ?.name ||
            null,
        },
      });
    } catch (error) {
      console.error(
        'Login error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to login',
      });
    }
  }
);

// ─────────────────────────────────────
// DELETE /api/auth/delete-account
// Protected account deletion
// ─────────────────────────────────────

router.delete(
  '/delete-account',
  authLimiter,
  verifyToken,
  async (req, res) => {
    try {
      const { password } =
        req.body;

      if (
        typeof password !== 'string' ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Password is required to delete your account',
        });
      }

      const email =
        req.user?.email;

      if (!email) {
        return res.status(400).json({
          success: false,
          error:
            'Unable to verify account',
        });
      }

      // Re-authenticate before destructive action
      const {
        error: loginError,
      } =
        await supabase.auth
          .signInWithPassword({
            email,
            password,
          });

      if (loginError) {
        return res.status(401).json({
          success: false,
          error:
            'Incorrect password',
        });
      }

      const userId =
        req.user.id;

      // Delete user's scans
      const {
        error: scansError,
      } = await supabaseAdmin
        .from('scans')
        .delete()
        .eq(
          'user_id',
          userId
        );

      if (scansError) {
        console.error(
          'Delete scans error:',
          scansError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to delete account',
        });
      }

      // Delete user's water history
      const {
        error: waterError,
      } = await supabaseAdmin
        .from('water_intake')
        .delete()
        .eq(
          'user_id',
          userId
        );

      if (waterError) {
        console.error(
          'Delete water data error:',
          waterError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to delete account',
        });
      }

      // Delete profile
      const {
        error: profileError,
      } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq(
          'id',
          userId
        );

      if (profileError) {
        console.error(
          'Delete profile error:',
          profileError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to delete account',
        });
      }

      // Finally delete Supabase Auth user
      const {
        error: userDeleteError,
      } =
        await supabaseAdmin
          .auth
          .admin
          .deleteUser(
            userId
          );

      if (userDeleteError) {
        console.error(
          'Delete auth user error:',
          userDeleteError.message
        );

        return res.status(500).json({
          success: false,
          error:
            'Unable to delete account',
        });
      }

      return res.json({
        success: true,
        message:
          'Account deleted successfully',
      });
    } catch (error) {
      console.error(
        'Delete account error:',
        error.message
      );

      return res.status(500).json({
        success: false,
        error:
          'Unable to delete account',
      });
    }
  }
);

module.exports = router;