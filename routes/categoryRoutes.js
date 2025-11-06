// routes/categoryRoutes.js - Enhanced with better error handling and logging
import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryInsights,
  suggestCategory
} from '../controllers/categoryController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Enhanced logging middleware for category routes
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📂 [CategoryRoutes] ${req.method} ${req.originalUrl} - ${timestamp}`);
  console.log(`📂 [CategoryRoutes] Auth header present: ${!!req.headers.authorization}`);
  console.log(`📂 [CategoryRoutes] User-Agent: ${req.headers['user-agent'] || 'Unknown'}`);
  next();
});

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Additional middleware to log successful authentication
router.use((req, res, next) => {
  console.log(`✅ [CategoryRoutes] User authenticated:`, {
    id: req.user?.id,
    email: req.user?.email,
    name: req.user?.name
  });
  next();
});

// Enhanced error handling wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    const routeName = req.route?.path || req.path;
    console.log(`🔄 [CategoryRoutes] Executing handler for ${req.method} ${routeName}`);
    
    Promise.resolve(fn(req, res, next))
      .then((result) => {
        console.log(`✅ [CategoryRoutes] Handler completed successfully for ${req.method} ${routeName}`);
        return result;
      })
      .catch((error) => {
        console.error(`❌ [CategoryRoutes] Handler error for ${req.method} ${routeName}:`, {
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          userId: req.user?.id
        });
        next(error);
      });
  };
};

// Category CRUD routes
router.get('/', asyncHandler(getCategories));
router.post('/', asyncHandler(createCategory));
router.put('/:id', asyncHandler(updateCategory));
router.delete('/:id', asyncHandler(deleteCategory));

// Category insights and suggestions
router.get('/insights', asyncHandler(getCategoryInsights));
router.get('/suggest', asyncHandler(suggestCategory));

// Health check endpoint for categories
router.get('/health', asyncHandler(async (req, res) => {
  console.log('🏥 [CategoryRoutes] Health check requested');
  
  res.json({
    success: true,
    message: 'Category routes are healthy',
    timestamp: new Date().toISOString(),
    user: {
      id: req.user.id,
      email: req.user.email,
      authenticated: true
    },
    routes: [
      'GET /api/categories - List all categories',
      'POST /api/categories - Create new category',
      'PUT /api/categories/:id - Update category',
      'DELETE /api/categories/:id - Delete category',
      'GET /api/categories/insights - Get category insights',
      'GET /api/categories/suggest - Get category suggestions'
    ]
  });
}));

// Enhanced error handler for category routes
router.use((error, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  console.error(`💥 [CategoryRoutes] [${requestId}] Error at ${timestamp}:`, {
    method: req.method,
    url: req.originalUrl,
    error: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    userId: req.user?.id,
    params: req.params,
    query: req.query,
    body: Object.keys(req.body || {}),
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: validationErrors,
      requestId
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      requestId
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry - category with this name already exists',
      requestId
    });
  }

  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    return res.status(500).json({
      success: false,
      error: 'Database error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      requestId
    });
  }

  // Default error response
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

export default router;