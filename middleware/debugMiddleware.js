// middleware/debugMiddleware.js - Debug middleware for better error tracking

import mongoose from 'mongoose';

// ==============================
// Request logging middleware
// ==============================
export const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n🔍 [${timestamp}] ${req.method} ${req.path}`);
  console.log('📊 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📝 Body:', JSON.stringify(req.body, null, 2));
  console.log('👤 User:', req.user ? req.user.userId : 'Not authenticated');
  next();
};

// ==============================
// Database connection checker
// ==============================
export const checkDatabaseConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Database not connected. State:', mongoose.connection.readyState);
    return res.status(503).json({
      success: false,
      message: 'Database connection unavailable',
      error: 'Database not connected'
    });
  }
  next();
};

// ==============================
// Enhanced error handler
// ==============================
export const errorHandler = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`\n❌ [${timestamp}] Error in ${req.method} ${req.path}:`);
  console.error('Error stack:', err.stack);
  console.error('Error details:', {
    name: err.name,
    message: err.message,
    code: err.code,
    statusCode: err.statusCode
  });

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const validationErrors = Object.values(err.errors).map(error => ({
      field: error.path,
      message: error.message,
      value: error.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors,
      type: 'ValidationError'
    });
  }

  // Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      type: 'CastError'
    });
  }

  // Duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      type: 'DuplicateError'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      type: 'AuthError'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      type: 'AuthError'
    });
  }

  // Default server error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    type: 'ServerError',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// ==============================
// Auth middleware with better error handling
// ==============================
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET); // ✅ fixed
    req.user = decoded;
    console.log('✅ Token verified for user:', decoded.userId);
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// ==============================
// Database health check endpoint
// ==============================
export const healthCheck = async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    const health = {
      status: dbState === 1 ? 'healthy' : 'unhealthy',
      database: {
        state: dbStates[dbState],
        host: mongoose.connection.host,
        name: mongoose.connection.name
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };

    console.log('🏥 Health check:', health);

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
};

// ==============================
// Request validation middleware
// ==============================
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const { error } = schema.validate(req.body);
      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));

        return res.status(400).json({
          success: false,
          message: 'Request validation failed',
          errors: validationErrors
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
