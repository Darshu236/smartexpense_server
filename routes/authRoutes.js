// backend/routes/authRoutes.js - UPDATED with Redis & Real SMS
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { authLimiter } from '../utils/rateLimiter.js';

const router = express.Router();

// ===== HELPER FUNCTIONS =====
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim().toLowerCase());
};

const validatePassword = (password) => {
  const minLength = parseInt(process.env.MIN_PASSWORD_LENGTH) || 8;
  
  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      message: 'Password is required'
    };
  }

  if (password.length < minLength) {
    return {
      valid: false,
      message: `Password must be at least ${minLength} characters long`
    };
  }

  return {
    valid: true,
    message: 'Password is valid'
  };
};

// Traditional registration (fallback without 2FA)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, userId: customUserId, phone } = req.body;

    console.log('📝 Traditional registration:', { name, email, hasCustomUserId: !!customUserId });

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Generate or validate userId
    let finalUserId;
    if (customUserId && customUserId.trim()) {
      if (!customUserId.endsWith('@myexpense')) {
        finalUserId = customUserId.toLowerCase().replace(/[^a-z0-9]/g, '') + '@myexpense';
      } else {
        finalUserId = customUserId;
      }

      const existingUserWithId = await User.findOne({ userId: finalUserId });
      if (existingUserWithId) {
        return res.status(409).json({
          success: false,
          message: 'This User ID is already taken'
        });
      }
    } else {
      finalUserId = await User.generateUserIdFromName(name);
    }

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      userId: finalUserId,
      phone: phone || null,
      registrationDate: new Date(),
      lastLogin: new Date()
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id.toString(),
        userId: user.userId,
        email: user.email 
      },
      process.env.JWT_SECRET || 'BftADbtb9sR0S1Iq1LpncSP1yiFRScR8I0uM+IiB6LA=',
      { expiresIn: '7d' }
    );

    console.log('✅ Traditional registration successful:', user.userId);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        userId: user.userId,
        phone: user.phone,
        registrationDate: user.registrationDate
      },
      token
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: `${field === 'email' ? 'Email' : 'User ID'} is already registered`
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again later.'
    });
  }
});

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await User.findByCredentials(email, password);

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { 
        id: user._id.toString(),
        userId: user.userId,
        email: user.email 
      },
      process.env.JWT_SECRET || 'BftADbtb9sR0S1Iq1LpncSP1yiFRScR8I0uM+IiB6LA=',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful:', user.userId);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        userId: user.userId,
        phone: user.phone,
        lastLogin: user.lastLogin
      },
      token
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    
    if (error.message === 'Invalid login credentials') {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again later.'
    });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        _id: user._id.toString(),
        id: user._id.toString(),
        userId: user.userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address || {},
        dateOfBirth: user.dateOfBirth,
        occupation: user.occupation,
        bio: user.bio,
        profilePicture: user.profilePicture,
        friends: user.friends,
        isPhoneVerified: user.isPhoneVerified,
        isEmailVerified: user.isEmailVerified,
        registrationDate: user.registrationDate,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// Check User ID availability
router.post('/check-userid', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const formattedUserId = userId.endsWith('@myexpense') ? userId : userId + '@myexpense';
    const existingUser = await User.findOne({ userId: formattedUserId });
    
    res.json({
      success: true,
      available: !existingUser,
      userId: formattedUserId,
      message: existingUser ? 'User ID is already taken' : 'User ID is available'
    });

  } catch (error) {
    console.error('❌ Error checking User ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check User ID availability'
    });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    console.log('👋 User logged out:', req.user.id);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

export default router;