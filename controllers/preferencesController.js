import User from '../models/User.js';
import authMiddleware from '../middleware/authMiddleware.js';
export const getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user.getPreferences()
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get preferences',
      error: error.message
    });
  }
};

// @desc    Update user preferences
// @route   PUT /api/preferences
// @access  Private
export const updatePreferences = async (req, res) => {
  try {
    const {
      currency,
      language,
      theme,
      timezone,
      notifications,
      dateFormat,
      numberFormat
    } = req.body;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate currency
    const validCurrencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY', 'CAD', 'AUD', 'SGD', 'CHF'];
    if (currency && !validCurrencies.includes(currency)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency code'
      });
    }

    // Validate language
    const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'hi', 'ar', 'zh', 'ja', 'ko', 'ru', 'bn', 'ur', 'ta', 'te', 'kn', 'ml', 'gu', 'mr', 'pa'];
    if (language && !validLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language code'
      });
    }

    // Validate theme
    const validThemes = ['light', 'dark', 'system'];
    if (theme && !validThemes.includes(theme)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theme'
      });
    }

    // Update preferences
    const preferencesToUpdate = {};
    if (currency) preferencesToUpdate.currency = currency;
    if (language) preferencesToUpdate.language = language;
    if (theme) preferencesToUpdate.theme = theme;
    if (timezone) preferencesToUpdate.timezone = timezone;
    if (dateFormat) preferencesToUpdate.dateFormat = dateFormat;
    if (numberFormat) preferencesToUpdate.numberFormat = numberFormat;
    if (notifications) preferencesToUpdate.notifications = notifications;

    await user.updatePreferences(preferencesToUpdate);

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: user.getPreferences()
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences',
      error: error.message
    });
  }
};

// @desc    Reset preferences to default
// @route   POST /api/preferences/reset
// @access  Private
export const resetPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reset to default values
    const defaultPreferences = {
      currency: 'USD',
      language: 'en',
      theme: 'light',
      timezone: 'UTC',
      notifications: {
        email: true,
        push: true,
        sms: false,
        marketing: false
      },
      dateFormat: 'MM/DD/YYYY',
      numberFormat: 'US'
    };

    await user.updatePreferences(defaultPreferences);

    res.status(200).json({
      success: true,
      message: 'Preferences reset to default',
      data: user.getPreferences()
    });

  } catch (error) {
    console.error('Reset preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset preferences',
      error: error.message
    });
  }
};

// @desc    Get currency exchange rates
// @route   GET /api/preferences/exchange-rates/:currency
// @access  Private
export const getExchangeRates = async (req, res) => {
  try {
    const { currency } = req.params;
    
    // You can integrate with a real exchange rate API like:
    // - Exchange Rates API (exchangerate-api.com)
    // - Fixer.io
    // - CurrencyAPI
    
    // For now, return mock data
    const mockRates = {
      USD: { EUR: 0.85, GBP: 0.73, INR: 83.12, JPY: 149.50, CNY: 7.24 },
      EUR: { USD: 1.18, GBP: 0.86, INR: 97.85, JPY: 176.29, CNY: 8.53 },
      GBP: { USD: 1.37, EUR: 1.16, INR: 113.89, JPY: 205.14, CNY: 9.93 },
      INR: { USD: 0.012, EUR: 0.010, GBP: 0.009, JPY: 1.80, CNY: 0.087 }
    };

    res.status(200).json({
      success: true,
      data: {
        base: currency,
        rates: mockRates[currency] || {},
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get exchange rates',
      error: error.message
    });
  }
};