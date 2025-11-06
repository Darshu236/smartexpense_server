// server.js - VERCEL COMPATIBLE VERSION
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Expense Tracker Server...');

const app = express();

// ===== Security middleware =====
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// ===== CORS (MUST BE BEFORE ROUTES) =====
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

console.log('🔒 CORS configured for:', corsOptions.origin);
app.use(cors(corsOptions));

// ===== Body parsing (MUST BE BEFORE ROUTES) =====
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== Static files =====
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== Request logging =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  
  if (req.originalUrl.startsWith('/api')) {
    console.log('📋 API Request:', {
      method: req.method,
      path: req.path,
      hasAuth: !!req.headers.authorization,
      contentType: req.headers['content-type']
    });
  }
  next();
});

// ===== Root route =====
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🎯 Smart Expense Tracker API',
    version: '1.0.0',
    status: 'Running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      debug: '/api/debug/routes',
      auth: '/api/auth/*',
      users: '/api/users/*',
      transactions: '/api/transactions/*',
      expenses: '/api/expenses/*',
      budgets: '/api/budgets/*',
      reports: '/api/reports/*',
      friends: '/api/friends/*',
      groups: '/api/groups/*',
      notifications: '/api/notifications/*',
      debts: '/api/debts/*',
      splitExpenses: '/api/split-expenses/*',
      forecast: '/api/forecast/*',
      categories: '/api/categories/*',
      settings: '/api/settings/*',
      preferences: '/api/preferences/*'
    },
    documentation: 'Visit /api/debug/routes for detailed endpoint list'
  });
});

// ===== Health check (BEFORE rate limiting) =====
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    uptime: process.uptime()
  });
});

// ===== Debug endpoint (BEFORE rate limiting) =====
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      const routerPath = middleware.regexp.source
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace('^', '');
      
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: routerPath + handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  res.json({ 
    success: true,
    count: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path))
  });
});

// ===== Rate limiting =====
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    return false;
  }
});

console.log('📦 Loading route modules...');

// Import routes
import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import debtRoutes from './routes/debtRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import splitExpenseRoutes from './routes/splitExpenseRoutes.js';
import userRoutes from './routes/userRoutes.js';
import forecastRoutes from './routes/forecastRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import preferencesRoutes from './routes/preferencesRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import groupRoutes from './routes/groupRoutes.js';

console.log('✅ All route modules loaded');
console.log('🔧 Mounting routes...');

// Apply auth limiter only to auth routes
app.use('/api/auth', authLimiter, authRoutes);

// Mount all other routes
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/split-expenses', splitExpenseRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/categories', categoryRoutes);
console.log('✅ All routes mounted successfully');

// Apply general rate limiter AFTER routes in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api', generalLimiter);
}

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error('💥 GLOBAL ERROR:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ 
      success: false, 
      message: 'File too large' 
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ 
      success: false, 
      message: 'Too many files' 
    });
  }

  res.status(500).json({ 
    success: false, 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===== 404 handler =====
app.use((req, res) => {
  console.log('❌ 404 Not Found:', req.method, req.originalUrl);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    suggestion: 'Check GET /api/debug/routes for available endpoints',
  });
});

// ===== Database connection =====
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('✅ Using existing MongoDB connection');
    return;
  }

  try {
    const conn = await mongoose.connect(
      process.env.MONGO_URI || 'mongodb://localhost:27017/expense-tracker',
      { 
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      }
    );
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    throw error;
  }
};

// ===== For Local Development =====
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000;
  
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      console.log(`🏠 Root: http://localhost:${PORT}/`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
      console.log(`🔍 Debug: http://localhost:${PORT}/api/debug/routes`);
      console.log('='.repeat(50) + '\n');
    });
  }).catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

// ===== For Vercel Serverless =====
// Connect to database before handling requests
connectDB().catch(err => console.error('DB connection error:', err));

// Export for Vercel
export default app;