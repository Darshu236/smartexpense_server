// routes/splitExpenseRoutes.js - Fixed version without missing dependencies

import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  createSplitExpense,
  getSplitExpenses,
  getSplitExpensesSummary,
  updateSplitExpenseStatus,
} from '../controllers/splitExpenseController.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Create a new split expense
 */
router.post('/', createSplitExpense);

/**
 * Get split expenses for the authenticated user
 */
router.get('/', getSplitExpenses);

/**
 * Get summary of split expenses for the user
 */
router.get('/summary', getSplitExpensesSummary);

/**
 * Get expense details
 */
router.get('/:expenseId', async (req, res) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user._id;

    const SplitExpense = (await import('../models/splitExpenseModel.js')).default;

    const expense = await SplitExpense.findById(expenseId)
      .populate('paidBy', 'name email')
      .populate('createdBy', 'name email')
      .populate('splits.friendId', 'name email');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check access
    const userHasAccess =
      expense.createdBy._id.toString() === userId.toString() ||
      expense.paidBy._id.toString() === userId.toString() ||
      expense.splits.some(split => 
        split.friendId && split.friendId._id.toString() === userId.toString()
      );

    if (!userHasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      expense
    });

  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense',
      error: error.message
    });
  }
});

/**
 * Update split expense status
 */
router.put('/:expenseId/status', updateSplitExpenseStatus);

/**
 * Delete split expense
 */
router.delete('/:expenseId', async (req, res) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user._id;

    const SplitExpense = (await import('../models/splitExpenseModel.js')).default;

    const expense = await SplitExpense.findById(expenseId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check if user has permission to delete
    const hasPermission =
      expense.createdBy.toString() === userId.toString() ||
      expense.paidBy.toString() === userId.toString();

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this expense'
      });
    }

    // Delete the split expense
    await SplitExpense.findByIdAndDelete(expenseId);

    console.log('✅ Expense deleted successfully:', expenseId);

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
});

export default router;