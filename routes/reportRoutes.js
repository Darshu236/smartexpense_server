
import express from 'express';
import { getMonthlyReport } from '../controllers/reportController.js';
import authMiddleware from '../middleware/authMiddleware.js';
const router = express.Router();
router.use(authMiddleware);
router.get('/', getMonthlyReport);
export default router;


