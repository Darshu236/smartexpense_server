// routes/transactionRoutes.js
import express from 'express';
import {
  getTransactions,
  addTransaction,
  deleteTransaction,
  updateTransaction,        // ✏️ NEW import
  getMLInsights,
  predictCategory,
  getSpendingForecast,
  getAnomalies,
  getSpendingAnalysis,
  getBudgetRecommendations
} from '../controllers/transactionController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth middleware to all transaction routes
router.use(authMiddleware);

// ===== Main CRUD routes =====
router.get('/', getTransactions);              // Get all user transactions
router.post('/', addTransaction);              // Add new transaction
router.put('/:id', updateTransaction);         // ✏️ Update transaction
router.delete('/:id', deleteTransaction);      // Delete transaction

// ===== ML feature placeholder routes =====
router.get('/ml/insights', getMLInsights);
router.post('/ml/predict', predictCategory);
router.get('/ml/forecast', getSpendingForecast);
router.get('/ml/anomalies', getAnomalies);
router.get('/ml/analysis', getSpendingAnalysis);
router.get('/ml/recommendations', getBudgetRecommendations);

export default router;
