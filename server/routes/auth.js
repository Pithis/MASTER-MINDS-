const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { Users, Verifications } = require('../db');
const { generateToken, requireAuth } = require('../middleware/auth');

const googleClient = new OAuth2Client('484090538674-krtmknjabld56t8goceuv7puo4c7ml9q.apps.googleusercontent.com');

// Helper to generate verification code
function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const exists = Users.findByEmail(email);
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const code = genCode();
    const hash = bcrypt.hashSync(password, 10);

    Verifications.create({
      email,
      code,
      name,
      password: hash,
      phone: phone || ''
    });

    // We return the code so the client-side EmailJS or server can use it.
    // In our client-side app, EmailJS sends it, so we can return the code.
    res.json({ code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/verify ────────────────────────────────────
router.post('/verify', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required' });
  }

  try {
    const v = Verifications.findByEmail(email);
    if (!v) {
      return res.status(400).json({ error: 'No pending verification found' });
    }

    if (new Date(v.expires_at) < new Date()) {
      Verifications.delete(email);
      return res.status(400).json({ error: 'Code expired. Please register again.' });
    }

    if (v.code !== code) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(v.name)}&background=0f766e&color=fff`;
    const userId = Users.create({
      name: v.name,
      email: v.email,
      password: v.password,
      phone: v.phone,
      role: 'customer',
      verified: true,
      avatar
    });

    Verifications.delete(email);

    const user = Users.findById(userId);
    const token = generateToken(user);

    // Remove password field before sending user
    delete user.password;

    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = Users.findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'No account found with this email' });
    }

    if (!user.verified) {
      return res.status(400).json({ error: 'Please verify your email first' });
    }

    if (!user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const token = generateToken(user);
    delete user.password;

    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/google ────────────────────────────────────
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: '484090538674-krtmknjabld56t8goceuv7puo4c7ml9q.apps.googleusercontent.com'
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    let user = Users.findByEmail(email);
    if (!user) {
      const userId = Users.create({
        name,
        email,
        password: null,
        phone: '',
        role: email === 'tobi268820@gmail.com' ? 'admin' : 'customer',
        verified: true,
        avatar: picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0f766e&color=fff`
      });
      user = Users.findById(userId);
    } else {
      // Force admin role if it's the admin email but role is not admin
      if (email === 'tobi268820@gmail.com' && user.role !== 'admin') {
        Users.update(user.id, { role: 'admin' });
        user = Users.findById(user.id);
      }
    }

    const token = generateToken(user);
    delete user.password;

    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Google authentication failed' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = Users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    delete user.password;
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
