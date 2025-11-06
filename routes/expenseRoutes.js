import express from 'express';
import {
  getExpenses,
  createExpense,
  splitExpense,
  updateExpense,
  deleteExpense,
  getExpenseAnalytics,
  scanBill
} from '../controllers/expenseController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Basic routes
router.get('/', getExpenses);
router.post('/', createExpense);

// Special routes
router.post('/split', splitExpense);
router.get('/analytics', getExpenseAnalytics);
router.post('/scan-bill', upload.single('bill'), scanBill);

// Routes with parameters
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

export default router;