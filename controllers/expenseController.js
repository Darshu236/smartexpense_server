import Expense from '../models/Expense.js';
import Notification from '../models/Notification.js';
import Category from '../models/Category.js';

// Get all expenses for user
export const getExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, startDate, endDate } = req.query;
    
    const filter = { user: req.user._id };
    
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(filter)
      .populate('splits.friendId', 'name email')
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Expense.countDocuments(filter);

    res.json({
      success: true,
      expenses,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expenses' });
  }
};

// Create a new expense without splits
export const createExpense = async (req, res) => {
  try {
    const { description, totalAmount, category, date } = req.body;

    if (!description || !totalAmount || !category) {
      return res.status(400).json({ 
        success: false, 
        error: 'Description, totalAmount, and category are required' 
      });
    }

    const expense = new Expense({
      user: req.user._id,
      description,
      totalAmount,
      category,
      date: date ? new Date(date) : new Date(),
      splits: []
    });

    const savedExpense = await expense.save();

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      expense: savedExpense
    });
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ success: false, error: 'Failed to create expense' });
  }
};

// Create a new split expense with validation and notification
export const splitExpense = async (req, res) => {
  try {
    const { description, totalAmount, category, splits, date } = req.body;

    if (!description || !totalAmount || !category || !splits || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Description, totalAmount, category, and valid splits are required' 
      });
    }

    // Validate total split amount
    const totalSplitAmount = splits.reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);
    if (Math.abs(totalSplitAmount - totalAmount) > 0.01) {
      return res.status(400).json({ 
        success: false, 
        error: 'Split amounts must sum up to totalAmount' 
      });
    }

    const expense = new Expense({
      user: req.user._id,
      description,
      totalAmount,
      category,
      date: date ? new Date(date) : new Date(),
      splits
    });

    const savedExpense = await expense.save();

    // Send notification to each payer (not the sender)
    for (const split of splits) {
      if (split.friendId.toString() !== req.user._id.toString()) {
        await Notification.create({
          toUserId: split.friendId,
          fromUserId: req.user._id,
          type: 'expense_split',
          title: 'You have a new expense',
          message: `You owe ₹${split.amount} for "${description}".`,
          read: false
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Split expense created and notifications sent successfully',
      expense: savedExpense
    });
  } catch (error) {
    console.error('Error splitting expense:', error);
    res.status(500).json({ success: false, error: 'Failed to create split expense' });
  }
};

// Update expense
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, totalAmount, category, date, splits } = req.body;

    const expense = await Expense.findOne({ _id: id, user: req.user._id });
    
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    if (description) expense.description = description;
    if (totalAmount) expense.totalAmount = totalAmount;
    if (category) expense.category = category;
    if (date) expense.date = new Date(date);
    if (splits) expense.splits = splits;

    const updatedExpense = await expense.save();

    res.json({
      success: true,
      message: 'Expense updated successfully',
      expense: updatedExpense
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ success: false, error: 'Failed to update expense' });
  }
};

// Delete expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findOneAndDelete({ _id: id, user: req.user._id });
    
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
};

// Get expense analytics
export const getExpenseAnalytics = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let startDate = new Date();
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    const expenses = await Expense.find({
      user: req.user._id,
      date: { $gte: startDate }
    });

    const totalAmount = expenses.reduce((sum, expense) => sum + expense.totalAmount, 0);
    const categoryWise = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.totalAmount;
      return acc;
    }, {});

    res.json({
      success: true,
      analytics: {
        totalAmount,
        totalExpenses: expenses.length,
        categoryWise,
        period
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

// Scan bill and return extracted data (mock)
export const scanBill = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No bill file uploaded' });
    }

    // TODO: Add OCR functionality. For now, mock data:
    const extractedData = {
      vendor: "Sample Store",
      totalAmount: 123.45,
      date: "2025-08-08",
      rawText: "Sample Store\nTotal: ₹123.45\nDate: 2025-08-08"
    };

    res.json({ success: true, ...extractedData });
  } catch (error) {
    console.error('Error scanning bill:', error);
    res.status(500).json({ success: false, error: 'Failed to scan bill' });
  }
};