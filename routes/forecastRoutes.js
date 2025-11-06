// routes/forecastRoutes.js
import express from 'express';
import {
  getSpendingForecast,
  getBudgetRecommendations,
  getSpendingAnomalies
} from '../controllers/forecastController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Forecast routes
router.get('/', getSpendingForecast);
router.get('/budget-recommendations', getBudgetRecommendations);
router.get('/anomalies', getSpendingAnomalies);

export default router;