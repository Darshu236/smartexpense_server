// server/routes/receiptScanRoute.js - Complete receipt scanning implementation
import express from 'express';
import multer from 'multer';
import { scanReceiptWithGoogle } from '../services/googleVisionOCR.js';
import { scanReceiptWithAzure } from '../services/azureVisionOCR.js';
import { scanReceiptWithAWS } from '../services/awsTextractOCR.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    
    // Check specific image formats
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Unsupported image format. Please use JPEG, PNG, GIF, BMP, or WebP'), false);
    }
    
    cb(null, true);
  }
});

// OCR Provider priority order (can be configured based on your API keys)
const getAvailableProviders = () => {
  const providers = [];
  
  // Check Google Cloud Vision
  if (process.env.GOOGLE_CLOUD_PROJECT_ID && 
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PRIVATE_KEY)) {
    providers.push('google');
  }
  
  // Check Azure Computer Vision
  if (process.env.AZURE_COMPUTER_VISION_KEY && process.env.AZURE_COMPUTER_VISION_ENDPOINT) {
    providers.push('azure');
  }
  
  // Check AWS Textract
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    providers.push('aws');
  }
  
  return providers;
};

// Fallback text parsing for when OCR services fail
const fallbackTextParsing = (filename) => {
  // Extract basic info from filename or provide default structure
  return {
    success: true,
    message: 'OCR services unavailable. Please enter expense details manually.',
    provider: 'fallback',
    data: {
      description: `Expense from ${filename || 'receipt'}`,
      totalAmount: null,
      subtotal: null,
      tax: null,
      tip: null,
      merchantName: null,
      date: new Date().toISOString().split('T')[0],
      items: [],
      itemCount: 0
    },
    extractedText: '',
    validation: {
      isValid: false,
      errors: ['OCR services not available'],
      warnings: ['Please manually verify all expense details']
    },
    confidence: 0.1
  };
};

// Main receipt scanning route
router.post('/', upload.single('receipt'), async (req, res) => {
  try {
    console.log('=== RECEIPT SCAN REQUEST ===');
    console.log('User:', req.user?.name || 'Unknown');
    console.log('File received:', {
      filename: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'UNAUTHORIZED'
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No receipt image provided. Please upload an image file.',
        error: 'NO_FILE'
      });
    }

    // Validate file size
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Please upload an image smaller than 10MB.',
        error: 'FILE_TOO_LARGE'
      });
    }

    // Get available OCR providers
    const providers = getAvailableProviders();
    console.log('Available OCR providers:', providers);

    if (providers.length === 0) {
      console.warn('No OCR providers configured');
      const fallbackResult = fallbackTextParsing(req.file.originalname);
      return res.status(200).json(fallbackResult);
    }

    const imageBuffer = req.file.buffer;
    let lastError = null;
    let result = null;

    // Try OCR providers in order of preference
    for (const provider of providers) {
      try {
        console.log(`Trying OCR provider: ${provider}`);
        
        switch (provider) {
          case 'google':
            result = await scanReceiptWithGoogle(imageBuffer);
            break;
          case 'azure':
            result = await scanReceiptWithAzure(imageBuffer);
            break;
          case 'aws':
            result = await scanReceiptWithAWS(imageBuffer);
            break;
          default:
            continue;
        }

        if (result && result.success) {
          console.log(`OCR successful with provider: ${provider}`);
          
          // Add metadata
          result.metadata = {
            filename: req.file.originalname,
            fileSize: req.file.size,
            mimetype: req.file.mimetype,
            processedAt: new Date().toISOString(),
            userId: req.user.id || req.user._id,
            provider: provider
          };

          return res.status(200).json(result);
        } else {
          lastError = result?.error || `${provider} OCR failed`;
          console.warn(`${provider} OCR failed:`, result?.message || 'Unknown error');
        }

      } catch (error) {
        lastError = error.message;
        console.error(`${provider} OCR error:`, error.message);
        continue;
      }
    }

    // If all providers failed, return fallback
    console.warn('All OCR providers failed, using fallback');
    const fallbackResult = fallbackTextParsing(req.file.originalname);
    fallbackResult.error = lastError;
    fallbackResult.message = 'OCR processing failed. Please enter expense details manually.';
    
    return res.status(200).json(fallbackResult);

  } catch (error) {
    console.error('Receipt scanning route error:', error);
    
    // Handle specific errors
    if (error.message.includes('Only image files')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload an image file (JPEG, PNG, etc.)',
        error: 'INVALID_FILE_TYPE'
      });
    }
    
    if (error.message.includes('File too large')) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Please upload an image smaller than 10MB.',
        error: 'FILE_TOO_LARGE'
      });
    }

    if (error.message.includes('Unsupported image format')) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported image format. Please use JPEG, PNG, GIF, BMP, or WebP format.',
        error: 'UNSUPPORTED_FORMAT'
      });
    }

    // Generic error response
    return res.status(500).json({
      success: false,
      message: 'Failed to process receipt. Please try again or enter details manually.',
      error: 'PROCESSING_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check route for OCR services
router.get('/health', async (req, res) => {  try {
    const providers = getAvailableProviders();
    const healthStatus = {
      timestamp: new Date().toISOString(),
      availableProviders: providers,
      status: providers.length > 0 ? 'healthy' : 'degraded',
      details: {}
    };

    // Test each provider (optional - can be resource intensive)
    if (req.query.test === 'true') {
      for (const provider of providers) {
        try {
          let testResult;
          switch (provider) {
            case 'google':
              const { testGoogleVisionConfig } = await import('../services/googleVisionOCR.js');
              testResult = await testGoogleVisionConfig();
              break;
            case 'azure':
              const { testAzureVisionConfig } = await import('../services/azureVisionOCR.js');
              testResult = await testAzureVisionConfig();
              break;
            case 'aws':
              const { testAWSTextractConfig } = await import('../services/awsTextractOCR.js');
              testResult = await testAWSTextractConfig();
              break;
          }
          healthStatus.details[provider] = testResult;
        } catch (error) {
          healthStatus.details[provider] = {
            success: false,
            message: error.message
          };
        }
      }
    }

    res.status(200).json(healthStatus);

  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Configuration info route (for debugging)
router.get('/config', (req, res) => {  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  const config = {
    googleConfigured: !!(process.env.GOOGLE_CLOUD_PROJECT_ID && 
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PRIVATE_KEY)),
    azureConfigured: !!(process.env.AZURE_COMPUTER_VISION_KEY && process.env.AZURE_COMPUTER_VISION_ENDPOINT),
    awsConfigured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    maxFileSize: '10MB',
    supportedFormats: ['JPEG', 'PNG', 'GIF', 'BMP', 'WebP']
  };

  res.status(200).json(config);
});

export default router;