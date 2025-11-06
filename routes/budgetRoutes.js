// routes/budgetRoutes.js
import express from 'express';
import { listBudgets, createBudget, updateBudget, deleteBudget } from '../controllers/budgetController.js';
import authMiddleware from '../middleware/authMiddleware.js'; // your JWT auth middleware

const router = express.Router();

router.use(authMiddleware); // all below require auth

router.get('/', listBudgets);            // GET /api/budgets?month=YYYY-MM
router.post('/', createBudget);          // POST /api/budgets
router.put('/:id', updateBudget);        // PUT /api/budgets/:id
router.delete('/:id', deleteBudget);     // DELETE /api/budgets/:id

export default router;
