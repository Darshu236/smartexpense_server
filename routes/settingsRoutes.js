// routes/settingsRoutes.js - Fixed to use MongoDB
import express from 'express';
import jwt from 'jsonwebtoken';
import Settings from '../models/Settings.js'; // Import your Settings model

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  console.log('🔍 Settings auth middleware triggered');
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = user;
    console.log('✅ Token verified for user:', user.userId);
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// GET /api/settings - Get user settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    // The userId should match what's stored in your users collection
    const userId = req.user.userId || req.user.id || req.user._id;
    console.log('📖 Getting settings for user:', userId);
    console.log('🔍 Full user object from token:', req.user);
    
    // Try to find existing settings in database
    let userSettings = await Settings.findOne({ userId: userId.toString() });
    console.log('🔍 Found settings in DB:', userSettings);
    
    if (!userSettings) {
      // If no settings found, create default settings
      console.log('📝 No settings found, creating defaults for user:', userId);
      userSettings = new Settings({
        userId: userId.toString(),
        name: req.user.name || '',
        email: req.user.email || '',
        currency: 'INR',
        theme: 'light',
        budgetLimit: 50000,
        lowBalanceAlert: true,
        lowBalanceThreshold: 5000
      });
      await userSettings.save();
      console.log('✅ Created new settings:', userSettings);
    }
    
    // Return settings (exclude sensitive fields)
    const settings = {
      currency: userSettings.currency,
      theme: userSettings.theme,
      budgetLimit: userSettings.budgetLimit,
      lowBalanceAlert: userSettings.lowBalanceAlert,
      lowBalanceThreshold: userSettings.lowBalanceThreshold,
      name: userSettings.name,
      email: userSettings.email
    };
    
    console.log('✅ Returning settings:', settings);
    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// PUT /api/settings - Update user settings
router.put('/', authenticateToken, async (req, res) => {
  try {
    // The userId should match what's stored in your users collection  
    const userId = req.user.userId || req.user.id || req.user._id;
    const { currency, theme, budgetLimit, lowBalanceAlert, lowBalanceThreshold, name, email } = req.body;

    console.log('💾 Updating settings for user:', userId);
    console.log('📝 New settings:', req.body);
    console.log('🔍 Full user object from token:', req.user);

    // Validate required fields
    if (!currency || !theme || budgetLimit === undefined) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ message: 'Missing required fields: currency, theme, budgetLimit' });
    }

    // Find existing settings or create new ones
    let userSettings = await Settings.findOne({ userId: userId.toString() });
    console.log('🔍 Found existing settings:', userSettings);
    
    if (!userSettings) {
      // Create new settings document
      console.log('📝 Creating new settings document');
      userSettings = new Settings({
        userId: userId.toString(),
        name: name || req.user.name || '',
        email: email || req.user.email || '',
        currency,
        theme,
        budgetLimit: Number(budgetLimit),
        lowBalanceAlert: Boolean(lowBalanceAlert),
        lowBalanceThreshold: Number(lowBalanceThreshold)
      });
    } else {
      // Update existing settings
      console.log('📝 Updating existing settings');
      userSettings.currency = currency;
      userSettings.theme = theme;
      userSettings.budgetLimit = Number(budgetLimit);
      userSettings.lowBalanceAlert = Boolean(lowBalanceAlert);
      userSettings.lowBalanceThreshold = Number(lowBalanceThreshold);
      
      if (name !== undefined) userSettings.name = name;
      if (email !== undefined) userSettings.email = email;
    }

    // Save to database
    const savedSettings = await userSettings.save();
    console.log('✅ Settings saved to database:', savedSettings);

    console.log('✅ Settings updated successfully in database');
    res.json({ 
      message: 'Settings updated successfully',
      settings: {
        currency: savedSettings.currency,
        theme: savedSettings.theme,
        budgetLimit: savedSettings.budgetLimit,
        lowBalanceAlert: savedSettings.lowBalanceAlert,
        lowBalanceThreshold: savedSettings.lowBalanceThreshold
      }
    });
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    console.error('❌ Full error details:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Debug route to check user token and settings
router.get('/debug', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    console.log('🔍 Debug - Full user object:', req.user);
    console.log('🔍 Debug - Extracted userId:', userId);
    
    // Check if settings exist
    const userSettings = await Settings.findOne({ userId: userId.toString() });
    console.log('🔍 Debug - Found settings:', userSettings);
    
    // Check all settings in database
    const allSettings = await Settings.find({});
    console.log('🔍 Debug - All settings in DB:', allSettings);
    
    res.json({
      message: 'Debug info',
      userFromToken: req.user,
      extractedUserId: userId,
      userSettings: userSettings,
      allSettingsInDb: allSettings
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
});

// Test route (no authentication required)
router.get('/test', (req, res) => {
  console.log('🧪 Settings test route hit');
  res.json({ 
    message: 'Settings route is working!', 
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /api/settings/test (this route)',
      'GET /api/settings (requires auth)',
      'PUT /api/settings (requires auth)',
      'GET /api/settings/debug (requires auth)'
    ]
  });
});

console.log('⚙️ Settings routes module loaded successfully');

export default router;