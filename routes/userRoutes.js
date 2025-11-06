// routes/userRoutes.js - COMPLETE FIXED VERSION
import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Rate limiting
const updateProfileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many profile update attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation
const profileValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('phone')
    .optional({ checkFalsy: true })
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number'),
  
  body('address.city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('City must be between 1 and 100 characters'),
  
  body('dateOfBirth')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Please provide a valid date of birth')
    .custom((value) => {
      if (!value) return true;
      const date = new Date(value);
      const now = new Date();
      const age = (now - date) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 13 || age > 120) {
        throw new Error('Age must be between 13 and 120 years');
      }
      return true;
    }),
  
  body('occupation')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Occupation must be less than 100 characters'),
  
  body('bio')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),
];

// GET /api/users/me - Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    console.log('📍 GET /me - req.user:', req.user);
    
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    console.log('✅ User found:', { id: user._id, email: user.email });

    res.json({
      success: true,
      data: user,
      user: user
    });

  } catch (error) {
    console.error('❌ Error in GET /me:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
});

// PUT /api/users/:userId - Update user profile
router.put('/:userId', 
  authMiddleware, 
  updateProfileLimiter,
  profileValidation,
  async (req, res) => {
    try {
      console.log('\n🔍 ========== UPDATE PROFILE REQUEST ==========');
      console.log('📋 URL Parameter userId:', req.params.userId);
      console.log('👤 Authenticated user object:', JSON.stringify(req.user, null, 2));
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      // CRITICAL FIX: Handle both MongoDB _id and custom userId
      const requestedUserId = req.params.userId;
      const authenticatedUser = req.user;
      
      console.log('🔐 Authorization check details:');
      console.log('  - Requested userId from URL:', requestedUserId);
      console.log('  - req.user.id (MongoDB _id):', authenticatedUser.id);
      console.log('  - req.user._id:', authenticatedUser._id);
      console.log('  - req.user.userId (custom field):', authenticatedUser.userId);
      
      // Check if requested userId matches any identifier of authenticated user
      const matchById = authenticatedUser.id === requestedUserId;
      const matchByObjectId = authenticatedUser._id?.toString() === requestedUserId;
      const matchByCustomUserId = authenticatedUser.userId === requestedUserId;
      
      console.log('  - Match by id:', matchById);
      console.log('  - Match by _id:', matchByObjectId);
      console.log('  - Match by userId:', matchByCustomUserId);
      
      const isAuthorized = matchById || matchByObjectId || matchByCustomUserId;
      
      console.log('  - FINAL AUTHORIZATION:', isAuthorized ? '✅ APPROVED' : '❌ DENIED');
      
      if (!isAuthorized) {
        console.log('❌ Authorization FAILED - Sending 403');
        return res.status(403).json({ 
          error: 'You do not have permission to update this profile.',
          message: 'You can only update your own profile'
        });
      }

      console.log('✅ Authorization PASSED');

      const updateData = req.body;
      const sanitizedData = sanitizeProfileData(updateData);
      sanitizedData.lastProfileUpdate = new Date();

      console.log('🔄 Updating user with sanitized data:', sanitizedData);

      // Use the authenticated user's MongoDB _id for the update
      const updatedUser = await User.findByIdAndUpdate(
        authenticatedUser.id, // Always use the verified MongoDB _id
        { $set: sanitizedData },
        { 
          new: true, 
          runValidators: true
        }
      ).select('-password');

      if (!updatedUser) {
        console.log('❌ User not found in database');
        return res.status(404).json({ error: 'User not found' });
      }

      console.log('✅ Profile updated successfully for:', updatedUser._id);
      console.log('========== UPDATE COMPLETE ==========\n');

      res.json({
        message: 'Profile updated successfully',
        user: updatedUser,
        success: true
      });

    } catch (error) {
      console.error('❌ Error updating profile:', error);
      
      if (error.name === 'ValidationError') {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: Object.values(error.errors).map(err => err.message)
        });
      }
      
      if (error.code === 11000) {
        return res.status(400).json({ 
          error: 'Duplicate field value', 
          field: Object.keys(error.keyValue)[0]
        });
      }
      
      res.status(500).json({ 
        error: 'Server error during profile update',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Helper function to sanitize profile data
function sanitizeProfileData(data) {
  const sanitized = {};
  
  const allowedFields = [
    'name', 'email', 'phone', 'address', 'dateOfBirth', 
    'occupation', 'bio'
  ];
  
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      if (field === 'address' && data[field]) {
        sanitized[field] = {};
        if (data[field].street) sanitized[field].street = data[field].street.trim();
        if (data[field].city) sanitized[field].city = data[field].city.trim();
        if (data[field].state) sanitized[field].state = data[field].state.trim();
        if (data[field].zipCode) sanitized[field].zipCode = data[field].zipCode.trim();
        if (data[field].country) sanitized[field].country = data[field].country.trim();
      } else {
        sanitized[field] = typeof data[field] === 'string' ? data[field].trim() : data[field];
      }
    }
  });
  
  return sanitized;
}

// DELETE /api/users/:id - Delete user
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check authorization
    const isAuthorized = 
      req.user.id === id || 
      req.user._id?.toString() === id ||
      req.user.userId === id;
    
    if (!isAuthorized && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'You can only delete your own profile' 
      });
    }
    
    const user = await User.findByIdAndDelete(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error while deleting user' });
  }
});

export default router;