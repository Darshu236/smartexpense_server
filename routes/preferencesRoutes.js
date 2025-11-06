// routes/preferencesRoutes.js - Complete Implementation
import express from "express";
import jwt from 'jsonwebtoken';

const router = express.Router();

console.log('🔧 Creating complete preferences router...');

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    req.user = user;
    next();
  });
};

// Request logging middleware for preferences routes
router.use((req, res, next) => {
  console.log('🎨 Preferences route hit:', req.method, req.path);
  console.log('🎨 Headers:', {
    authorization: req.headers.authorization ? 'Present' : 'Missing',
    'content-type': req.headers['content-type']
  });
  next();
});

// Default preferences
const defaultPreferences = {
  currency: 'USD',
  language: 'en',
  theme: 'light',
  timezone: 'America/New_York',
  notifications: {
    email: true,
    push: true,
    sms: false,
    marketing: false
  },
  dateFormat: 'MM/DD/YYYY',
  numberFormat: 'US'
};

// In-memory storage for demo (replace with database in production)
const userPreferences = new Map();

// Test route (no auth required)
router.get("/test", (req, res) => {
  console.log('🧪 Preferences test route hit!');
  res.json({ 
    message: "Preferences routes are working!",
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/preferences/test',
      'GET /api/preferences',
      'PUT /api/preferences', 
      'POST /api/preferences/reset'
    ]
  });
});

// GET /api/preferences - Get user preferences
router.get("/", authenticateToken, (req, res) => {
  try {
    console.log('📖 GET preferences for user:', req.user.id);
    
    const userId = req.user.id;
    const preferences = userPreferences.get(userId) || defaultPreferences;
    
    res.json({
      success: true,
      preferences,
      message: 'Preferences retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Error getting preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get preferences',
      details: error.message
    });
  }
});

// PUT /api/preferences - Update user preferences
router.put("/", authenticateToken, (req, res) => {
  try {
    console.log('💾 PUT preferences for user:', req.user.id);
    console.log('💾 Request body:', req.body);
    
    const userId = req.user.id;
    const currentPrefs = userPreferences.get(userId) || defaultPreferences;
    
    // Merge new preferences with existing ones
    const updatedPreferences = {
      ...currentPrefs,
      ...req.body,
      // Handle nested objects like notifications
      notifications: {
        ...currentPrefs.notifications,
        ...(req.body.notifications || {})
      }
    };
    
    // Validate currency if provided
    if (req.body.currency) {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY', 'CAD', 'AUD', 'SGD', 'CHF'];
      if (!validCurrencies.includes(req.body.currency)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid currency code',
          validCurrencies
        });
      }
    }
    
    // Validate theme if provided
    if (req.body.theme) {
      const validThemes = ['light', 'dark', 'system'];
      if (!validThemes.includes(req.body.theme)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid theme',
          validThemes
        });
      }
    }
    
    // Save preferences
    userPreferences.set(userId, updatedPreferences);
    
    console.log('✅ Preferences updated successfully');
    
    res.json({
      success: true,
      preferences: updatedPreferences,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
      details: error.message
    });
  }
});

// POST /api/preferences/reset - Reset preferences to defaults
router.post("/reset", authenticateToken, (req, res) => {
  try {
    console.log('🔄 Reset preferences for user:', req.user.id);
    
    const userId = req.user.id;
    userPreferences.set(userId, { ...defaultPreferences });
    
    console.log('✅ Preferences reset successfully');
    
    res.json({
      success: true,
      preferences: defaultPreferences,
      message: 'Preferences reset to defaults'
    });
  } catch (error) {
    console.error('❌ Error resetting preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset preferences',
      details: error.message
    });
  }
});

// GET /api/preferences/currencies - Get available currencies
router.get("/currencies", (req, res) => {
  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' }
  ];
  
  res.json({
    success: true,
    currencies
  });
});

// GET /api/preferences/timezones - Get available timezones
router.get("/timezones", (req, res) => {
  const timezones = [
    'America/New_York',
    'America/Chicago', 
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Mumbai',
    'Australia/Sydney'
  ];
  
  res.json({
    success: true,
    timezones
  });
});

console.log('✅ Complete preferences router created successfully');

export default router;