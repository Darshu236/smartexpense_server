// routes/receiptRoutes.js
import express from 'express';
import { upload, handleUploadError } from '../middleware/uploadMiddleware.js';

import { scanReceiptWithGoogle } from '../services/googleVisionOCR.js';
import { scanReceiptWithAWS } from '../services/awsTextractOCR.js';
import { scanReceiptWithAzure } from '../services/azureVisionOCR.js';

const router = express.Router();

// Main receipt scanning endpoint
router.post('/scan-receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No receipt image provided'
      });
    }

    console.log('Processing receipt:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    const ocrProvider = process.env.OCR_PROVIDER || 'google';
    let result;

    switch (ocrProvider) {
      case 'google':
        if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
          throw new Error('Google Vision API not configured');
        }
        result = await scanReceiptWithGoogle(req.file.buffer);
        break;

      case 'aws':
        if (!process.env.AWS_ACCESS_KEY_ID) {
          throw new Error('AWS Textract not configured');
        }
        result = await scanReceiptWithAWS(req.file.buffer);
        break;

      case 'azure':
        if (!process.env.AZURE_COMPUTER_VISION_KEY) {
          throw new Error('Azure Computer Vision not configured');
        }
        result = await scanReceiptWithAzure(req.file.buffer);
        break;

      default:
        throw new Error(`Unsupported OCR provider: ${ocrProvider}`);
    }

    res.json(result);

  } catch (error) {
    console.error('Receipt scanning error:', error);

    if (error.message.includes('not configured')) {
      return res.status(501).json({
        success: false,
        message: 'Receipt scanning is not yet configured. Please enter expense details manually.',
        featureStatus: 'not_configured',
        error: 'FEATURE_NOT_CONFIGURED'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process receipt. Please enter details manually.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'PROCESSING_ERROR'
    });
  }
});

// Health check endpoint
router.get('/scan-receipt/health', async (req, res) => {
  const health = {
    google: !!process.env.GOOGLE_CLOUD_PROJECT_ID,
    aws: !!process.env.AWS_ACCESS_KEY_ID,
    azure: !!process.env.AZURE_COMPUTER_VISION_KEY,
    tesseract: true
  };

  const activeProvider = process.env.OCR_PROVIDER || 'google';

  res.json({
    success: true,
    providers: health,
    activeProvider,
    configured: health[activeProvider] || false
  });
});

router.use(handleUploadError);

export default router;
