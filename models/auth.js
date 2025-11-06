

// ==========================================
// 12. CORRECTED auth.js (Convert to ES6)
// ==========================================
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Use the main User model

const router = express.Router();

// Register route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, userId } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Generate or validate userId
    let finalUserId = userId;
    if (!finalUserId) {
      finalUserId = await User.generateUserId();
    } else {
      // Check if provided userId already exists
      const existingUserId = await User.findOne({ userId: finalUserId });
      if (existingUserId) {
        return res.status(400).json({ error: 'User ID already exists, please try again' });
      }
    }

    // Create new user (password will be hashed by pre-save middleware)
    const newUser = new User({
      userId: finalUserId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      registrationDate: new Date()
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.userId,
        id: newUser._id,
        email: newUser.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        registrationDate: newUser.registrationDate
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: errors.join(', ') });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findByCredentials(email, password);
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { 
        userId: user.userId,
        id: user._id,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        lastLogin: user.lastLogin
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ error: error.message });
  }
});

export default router;