// controllers/budgetController.js - Fixed version
import Budget from '../models/Budget.js';
import mongoose from 'mongoose';

// OPTIONAL: if you already have Transaction model elsewhere, reuse it.
import Transaction from '../models/Transaction.js'; // fields: user, amount, type, category, date

const parseMonthRange = (month) => {
  try {
    // month in format YYYY-MM → start/end ISO dates
    const [y, m] = month.split('-').map(Number);
    
    // Validate year and month
    if (!y || !m || y < 1900 || y > 2100 || m < 1 || m > 12) {
      throw new Error('Invalid month format');
    }
    
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)); // first day of next month
    return { start, end };
  } catch (error) {
    throw new Error(`Invalid month format. Expected YYYY-MM, got: ${month}`);
  }
};

export const listBudgets = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const month = req.query.month;
    if (!month) {
      return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Invalid month format. Expected YYYY-MM' });
    }

    console.log(`Fetching budgets for user ${userId}, month ${month}`);

    const budgets = await Budget.find({ 
      user: new mongoose.Types.ObjectId(userId), 
      month 
    }).lean();

    console.log(`Found ${budgets.length} budgets`);

    // Compute "spent" per category from transactions for the same month + type.
    let spentMap = new Map();
    
    try {
      const { start, end } = parseMonthRange(month);
      console.log(`Aggregating transactions from ${start} to ${end}`);

      // Check if Transaction model exists and has data
      if (Transaction) {
        const txAgg = await Transaction.aggregate([
          { 
            $match: {
              user: new mongoose.Types.ObjectId(userId),
              date: { $gte: start, $lt: end }
            }
          },
          {
            $group: {
              _id: { category: '$category', type: '$type' },
              total: { $sum: { $abs: '$amount' } } // Use absolute value to handle negative amounts
            }
          }
        ]);

        console.log(`Transaction aggregation result:`, txAgg);

        txAgg.forEach(row => {
          const key = `${row._id.type}::${row._id.category}`;
          spentMap.set(key, Math.abs(row.total || 0)); // Ensure positive values
        });
      } else {
        console.warn('Transaction model not available, using spent = 0 for all budgets');
      }
    } catch (transactionError) {
      console.error('Error aggregating transactions:', transactionError);
      // Continue without transaction data rather than failing completely
    }

    const withSpent = budgets.map(b => {
      const key = `${b.type}::${b.category}`;
      const spent = spentMap.get(key) || 0;
      
      return { 
        ...b, 
        spent,
        _id: b._id.toString(), // Ensure _id is a string for frontend compatibility
        user: b.user.toString()
      };
    });

    console.log(`Returning ${withSpent.length} budgets with spending data`);

    res.json({ success: true, data: withSpent });
  } catch (err) {
    console.error('listBudgets error:', err);
    res.status(500).json({ 
      error: 'Failed to list budgets',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const createBudget = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { category, month, type, monthlyLimit, color } = req.body;

    // Validation
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json({ error: 'category is required and must be a non-empty string' });
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month is required and must be in YYYY-MM format' });
    }

    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type is required and must be either "income" or "expense"' });
    }

    if (!monthlyLimit || isNaN(monthlyLimit) || Number(monthlyLimit) <= 0) {
      return res.status(400).json({ error: 'monthlyLimit is required and must be a positive number' });
    }

    console.log(`Creating budget for user ${userId}:`, { category, month, type, monthlyLimit });

    // Check for existing budget
    const existingBudget = await Budget.findOne({
      user: new mongoose.Types.ObjectId(userId),
      category: category.trim(),
      month,
      type
    });

    if (existingBudget) {
      return res.status(409).json({ 
        error: 'Budget already exists for this category, month, and type',
        details: { category: category.trim(), month, type }
      });
    }

    const doc = await Budget.create({
      user: new mongoose.Types.ObjectId(userId),
      category: category.trim(),
      month,
      type,
      monthlyLimit: Number(monthlyLimit),
      color: color || '#D3D3D3'
    });

    console.log(`Budget created successfully:`, doc);

    // Convert to plain object and ensure _id is string
    const responseData = {
      ...doc.toObject(),
      _id: doc._id.toString(),
      user: doc.user.toString(),
      spent: 0 // New budgets start with 0 spent
    };

    res.status(201).json({ success: true, data: responseData });
  } catch (err) {
    console.error('createBudget error:', err);
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        error: 'Budget already exists for this category/month/type combination',
        details: process.env.NODE_ENV === 'development' ? err.keyValue : undefined
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create budget',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const updateBudget = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Valid budget ID is required' });
    }

    const { category, month, type, monthlyLimit, color } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    
    if (category !== undefined) {
      if (typeof category !== 'string' || category.trim() === '') {
        return res.status(400).json({ error: 'category must be a non-empty string' });
      }
      updateData.category = category.trim();
    }

    if (month !== undefined) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month must be in YYYY-MM format' });
      }
      updateData.month = month;
    }

    if (type !== undefined) {
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'type must be either "income" or "expense"' });
      }
      updateData.type = type;
    }

    if (monthlyLimit !== undefined) {
      if (isNaN(monthlyLimit) || Number(monthlyLimit) <= 0) {
        return res.status(400).json({ error: 'monthlyLimit must be a positive number' });
      }
      updateData.monthlyLimit = Number(monthlyLimit);
    }

    if (color !== undefined) {
      updateData.color = color;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    console.log(`Updating budget ${id} for user ${userId}:`, updateData);

    // Check for duplicate if category, month, or type is being updated
    if (updateData.category || updateData.month || updateData.type) {
      const existingBudget = await Budget.findOne({
        user: new mongoose.Types.ObjectId(userId),
        _id: { $ne: new mongoose.Types.ObjectId(id) }, // Exclude current budget
        category: updateData.category,
        month: updateData.month,
        type: updateData.type
      });

      if (existingBudget) {
        return res.status(409).json({ 
          error: 'Another budget already exists for this category/month/type combination' 
        });
      }
    }

    const updated = await Budget.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), user: new mongoose.Types.ObjectId(userId) },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    console.log(`Budget updated successfully:`, updated);

    // Convert to plain object and ensure _id is string
    const responseData = {
      ...updated.toObject(),
      _id: updated._id.toString(),
      user: updated.user.toString()
    };

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('updateBudget error:', err);
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        error: 'Budget already exists for this category/month/type combination',
        details: process.env.NODE_ENV === 'development' ? err.keyValue : undefined
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update budget',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const deleteBudget = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Valid budget ID is required' });
    }

    console.log(`Deleting budget ${id} for user ${userId}`);

    const deleted = await Budget.findOneAndDelete({ 
      _id: new mongoose.Types.ObjectId(id), 
      user: new mongoose.Types.ObjectId(userId) 
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    console.log(`Budget deleted successfully:`, deleted._id);

    res.json({ success: true, data: { id: deleted._id.toString() } });
  } catch (err) {
    console.error('deleteBudget error:', err);
    res.status(500).json({ 
      error: 'Failed to delete budget',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};