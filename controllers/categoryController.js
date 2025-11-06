// controllers/categoryController.js - DEBUG VERSION with extensive error handling
import Category from '../models/Category.js';
import mongoose from 'mongoose';

// Safe Transaction import with detailed logging
let Transaction = null;
let transactionImportError = null;

try {
  console.log('🔍 Attempting to import Transaction model...');
  const { default: TransactionModel } = await import('../models/Transaction.js');
  Transaction = TransactionModel;
  console.log('✅ Transaction model imported successfully');
  
  // Log the Transaction schema to understand its structure
  if (Transaction.schema) {
    console.log('📋 Transaction schema paths:', Object.keys(Transaction.schema.paths));
  }
} catch (error) {
  transactionImportError = error;
  console.warn('⚠️ Transaction model import failed:', error.message);
  console.warn('📝 Insights will show zero spending for all categories');
}

const parseMonthRange = (month) => {
  try {
    console.log(`📅 Parsing month range for: ${month}`);
    
    if (!month || typeof month !== 'string') {
      throw new Error(`Month must be a string, got: ${typeof month}`);
    }

    const parts = month.split('-');
    if (parts.length !== 2) {
      throw new Error(`Month must contain exactly one dash, got: ${parts.length - 1} dashes`);
    }

    const [yearStr, monthStr] = parts;
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    
    if (isNaN(y) || isNaN(m)) {
      throw new Error(`Year and month must be numbers, got year: ${yearStr}, month: ${monthStr}`);
    }
    
    if (y < 1900 || y > 2100) {
      throw new Error(`Year must be between 1900-2100, got: ${y}`);
    }
    
    if (m < 1 || m > 12) {
      throw new Error(`Month must be between 1-12, got: ${m}`);
    }
    
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    
    console.log(`📅 Parsed date range: ${start.toISOString()} to ${end.toISOString()}`);
    return { start, end };
  } catch (error) {
    console.error(`❌ parseMonthRange error:`, error.message);
    throw new Error(`Invalid month format: ${error.message}`);
  }
};

export const getCategories = async (req, res) => {
  try {
    console.log('📋 getCategories called');
    
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log(`👤 Fetching categories for user: ${userId}`);

    // Validate userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`❌ Invalid user ID format: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const categories = await Category.find({ 
      user: new mongoose.Types.ObjectId(userId),
      isArchived: { $ne: true } 
    }).lean();

    console.log(`✅ Found ${categories.length} categories`);

    const responseData = categories.map(cat => ({
      ...cat,
      _id: cat._id.toString(),
      user: cat.user.toString()
    }));

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('❌ getCategories error:', err.name, '-', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch categories',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        name: err.name,
        stack: err.stack
      } : undefined
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    console.log('➕ createCategory called with body:', req.body);
    
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { name, type, color, icon, monthlyBudget, keywords } = req.body;

    // Validation with detailed logging
    if (!name || typeof name !== 'string' || name.trim() === '') {
      console.error('❌ Invalid name:', { name, type: typeof name });
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }

    if (type && !['need', 'want'].includes(type)) {
      console.error('❌ Invalid type:', type);
      return res.status(400).json({ error: 'type must be either "need" or "want"' });
    }

    console.log(`👤 Creating category for user ${userId}:`, { name: name.trim(), type, monthlyBudget });

    // Validate userId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`❌ Invalid user ID format: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Check for existing category
    const existingCategory = await Category.findOne({
      user: new mongoose.Types.ObjectId(userId),
      name: name.trim(),
      isArchived: { $ne: true }
    });

    if (existingCategory) {
      console.warn('⚠️ Category already exists:', name.trim());
      return res.status(409).json({ 
        error: 'Category with this name already exists',
        details: { name: name.trim() }
      });
    }

    const categoryData = {
      user: new mongoose.Types.ObjectId(userId),
      name: name.trim(),
      type: type || 'need',
      color: color || '#8884d8',
      icon: icon || 'Tag',
      monthlyBudget: Number(monthlyBudget || 0),
      keywords: Array.isArray(keywords) ? keywords : []
    };

    console.log('📝 Category data to create:', categoryData);

    const doc = await Category.create(categoryData);

    console.log(`✅ Category created successfully with ID: ${doc._id}`);

    const responseData = {
      ...doc.toObject(),
      _id: doc._id.toString(),
      user: doc.user.toString()
    };

    res.status(201).json({ success: true, data: responseData });
  } catch (err) {
    console.error('❌ createCategory error:', err.name, '-', err.message);
    console.error('Stack:', err.stack);
    
    if (err.code === 11000) {
      console.error('❌ Duplicate key error:', err.keyValue);
      return res.status(409).json({ 
        error: 'Category with this name already exists',
        details: process.env.NODE_ENV === 'development' ? err.keyValue : undefined
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create category',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        name: err.name,
        stack: err.stack
      } : undefined
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    console.log('✏️ updateCategory called:', { id: req.params.id, body: req.body });
    
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.error('❌ Invalid category ID:', id);
      return res.status(400).json({ error: 'Valid category ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`❌ Invalid user ID format: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const { name, type, color, icon, monthlyBudget, keywords } = req.body;

    // Build update object
    const updateData = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        console.error('❌ Invalid name for update:', { name, type: typeof name });
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      updateData.name = name.trim();
    }

    if (type !== undefined) {
      if (!['need', 'want'].includes(type)) {
        console.error('❌ Invalid type for update:', type);
        return res.status(400).json({ error: 'type must be either "need" or "want"' });
      }
      updateData.type = type;
    }

    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (monthlyBudget !== undefined) updateData.monthlyBudget = Number(monthlyBudget || 0);
    if (keywords !== undefined) updateData.keywords = Array.isArray(keywords) ? keywords : [];

    if (Object.keys(updateData).length === 0) {
      console.error('❌ No valid update data provided');
      return res.status(400).json({ error: 'No valid update data provided' });
    }

    console.log(`📝 Update data for category ${id}:`, updateData);

    // Check for duplicate name if name is being updated
    if (updateData.name) {
      const existingCategory = await Category.findOne({
        user: new mongoose.Types.ObjectId(userId),
        _id: { $ne: new mongoose.Types.ObjectId(id) },
        name: updateData.name,
        isArchived: { $ne: true }
      });

      if (existingCategory) {
        console.warn('⚠️ Duplicate name conflict:', updateData.name);
        return res.status(409).json({ 
          error: 'Another category with this name already exists' 
        });
      }
    }

    const updated = await Category.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), user: new mongoose.Types.ObjectId(userId) },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      console.error('❌ Category not found for update:', { id, userId });
      return res.status(404).json({ error: 'Category not found' });
    }

    console.log(`✅ Category updated successfully: ${updated._id}`);

    const responseData = {
      ...updated.toObject(),
      _id: updated._id.toString(),
      user: updated.user.toString()
    };

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('❌ updateCategory error:', err.name, '-', err.message);
    console.error('Stack:', err.stack);
    
    if (err.code === 11000) {
      console.error('❌ Duplicate key error:', err.keyValue);
      return res.status(409).json({ 
        error: 'Category with this name already exists',
        details: process.env.NODE_ENV === 'development' ? err.keyValue : undefined
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update category',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        name: err.name,
        stack: err.stack
      } : undefined
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    console.log('🗑️ deleteCategory called:', req.params.id);
    
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.error('❌ Invalid category ID:', id);
      return res.status(400).json({ error: 'Valid category ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`❌ Invalid user ID format: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    console.log(`🗑️ Archiving category ${id} for user ${userId}`);

    const updated = await Category.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), user: new mongoose.Types.ObjectId(userId) },
      { $set: { isArchived: true } },
      { new: true }
    );

    if (!updated) {
      console.error('❌ Category not found for deletion:', { id, userId });
      return res.status(404).json({ error: 'Category not found' });
    }

    console.log(`✅ Category archived successfully: ${updated._id}`);

    res.json({ success: true, data: { id: updated._id.toString() } });
  } catch (err) {
    console.error('❌ deleteCategory error:', err.name, '-', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to archive category',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        name: err.name,
        stack: err.stack
      } : undefined
    });
  }
};

// ENHANCED getCategoryInsights with extensive debugging
export const getCategoryInsights = async (req, res) => {
  try {
    console.log('📊 getCategoryInsights called');
    console.log('📊 Query params:', req.query);
    console.log('📊 Request user:', req.user);
    
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`❌ Invalid user ID format: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const month = req.query.month;
    console.log(`📊 Month parameter: "${month}" (type: ${typeof month})`);
    
    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      console.error('❌ Invalid month parameter:', { month, type: typeof month });
      return res.status(400).json({ error: 'month parameter is required in YYYY-MM format' });
    }

    console.log(`📊 Fetching category insights for user ${userId}, month ${month}`);

    // Test database connection
    try {
      await mongoose.connection.db.admin().ping();
      console.log('✅ Database connection is healthy');
    } catch (dbError) {
      console.error('❌ Database connection issue:', dbError.message);
      return res.status(500).json({ error: 'Database connection error' });
    }

    // Get all categories for this user with detailed logging
    let categories;
    try {
      console.log('📋 Querying categories...');
      categories = await Category.find({ 
        user: new mongoose.Types.ObjectId(userId),
        isArchived: { $ne: true }
      }).lean();
      
      console.log(`📋 Found ${categories.length} categories`);
      if (categories.length > 0) {
        console.log('📋 Sample category:', categories[0]);
      }
    } catch (categoryError) {
      console.error('❌ Error fetching categories:', categoryError.message);
      throw new Error(`Failed to fetch categories: ${categoryError.message}`);
    }

    // Initialize spending data
    let spentMap = new Map();
    let transactionError = null;

    // Try to get transaction data
    if (Transaction) {
      try {
        console.log('💰 Transaction model available, fetching spending data...');
        
        const { start, end } = parseMonthRange(month);
        
        console.log(`💰 Querying transactions from ${start.toISOString()} to ${end.toISOString()}`);

        // Test if Transaction collection exists and has data
        const transactionCount = await Transaction.countDocuments({
          user: new mongoose.Types.ObjectId(userId)
        });
        console.log(`💰 Total transactions for user: ${transactionCount}`);

        if (transactionCount > 0) {
          // Sample a transaction to understand the schema
          const sampleTx = await Transaction.findOne({ 
            user: new mongoose.Types.ObjectId(userId) 
          }).lean();
          console.log('💰 Sample transaction:', sampleTx);

          // Aggregate transactions by category
          console.log('💰 Aggregating transactions...');
          const txAgg = await Transaction.aggregate([
            {
              $match: {
                user: new mongoose.Types.ObjectId(userId),
                date: { $gte: start, $lt: end },
                type: 'expense' // Only count expenses
              }
            },
            {
              $group: {
                _id: '$category', // Assuming category field exists
                total: { $sum: { $abs: '$amount' } }
              }
            }
          ]);

          console.log(`💰 Transaction aggregation result (${txAgg.length} categories):`, txAgg);

          txAgg.forEach((row, index) => {
            console.log(`💰 Aggregation row ${index}:`, row);
            if (row._id) {
              spentMap.set(row._id.toString(), Math.abs(row.total || 0));
            }
          });

          console.log('💰 Final spending map:', Array.from(spentMap.entries()));
        } else {
          console.log('💰 No transactions found for user');
        }
      } catch (txError) {
        transactionError = txError;
        console.error('❌ Error aggregating transactions:', txError.message);
        console.error('❌ Transaction error stack:', txError.stack);
        // Continue without transaction data
      }
    } else {
      console.warn('⚠️ Transaction model not available');
      if (transactionImportError) {
        console.warn('⚠️ Transaction import error:', transactionImportError.message);
      }
    }

    // Build insights array with detailed logging
    console.log('📊 Building insights array...');
    const insights = categories.map((cat, index) => {
      const categoryName = cat.name;
      const spent = spentMap.get(categoryName) || spentMap.get(cat._id.toString()) || 0;
      const progress = cat.monthlyBudget > 0 ? Math.round((spent / cat.monthlyBudget) * 100) : null;

      const insight = {
        id: cat._id.toString(),
        name: cat.name,
        type: cat.type,
        color: cat.color,
        icon: cat.icon,
        monthlyBudget: cat.monthlyBudget,
        keywords: cat.keywords,
        spent: spent,
        progress: progress
      };

      console.log(`📊 Insight ${index}:`, insight);
      return insight;
    });

    // Get top spending categories
    console.log('🏆 Building top categories...');
    const top = insights
      .filter(cat => cat.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        color: cat.color,
        spent: cat.spent
      }));

    console.log(`🏆 Top ${top.length} spending categories:`, top);

    const responseData = { 
      success: true, 
      insights: insights,
      top: top,
      month: month,
      metadata: {
        totalCategories: categories.length,
        categoriesWithSpending: top.length,
        transactionModelAvailable: !!Transaction,
        transactionError: transactionError ? transactionError.message : null
      }
    };

    console.log('✅ Returning insights response');
    res.json(responseData);

  } catch (err) {
    console.error('❌ getCategoryInsights CRITICAL ERROR:');
    console.error('❌ Error name:', err.name);
    console.error('❌ Error message:', err.message);
    console.error('❌ Error stack:', err.stack);
    console.error('❌ Request details:', {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      user: req.user ? { id: req.user.id || req.user._id } : 'none'
    });

    res.status(500).json({ 
      error: 'Failed to fetch category insights',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        name: err.name,
        stack: err.stack,
        query: req.query,
        transactionModelAvailable: !!Transaction,
        transactionImportError: transactionImportError ? transactionImportError.message : null
      } : undefined
    });
  }
};

export const suggestCategory = async (req, res) => {
  try {
    console.log('🔍 suggestCategory called:', req.query);
    
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      console.error('❌ No user ID found in request');
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error(`❌ Invalid user ID format: ${userId}`);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    const { description } = req.query;
    
    if (!description) {
      console.error('❌ No description provided');
      return res.status(400).json({ error: 'description parameter is required' });
    }

    console.log(`🔍 Suggesting category for user ${userId}, description: "${description}"`);

    // Get all categories with keywords
    const categories = await Category.find({ 
      user: new mongoose.Types.ObjectId(userId),
      isArchived: { $ne: true },
      keywords: { $exists: true, $not: { $size: 0 } }
    }).lean();

    console.log(`🔍 Found ${categories.length} categories with keywords`);

    const descriptionLower = description.toLowerCase();

    // Find matching categories based on keywords
    const matches = categories.filter(cat => {
      return cat.keywords.some(keyword => 
        descriptionLower.includes(keyword.toLowerCase()) ||
        keyword.toLowerCase().includes(descriptionLower)
      );
    });

    console.log(`🔍 Found ${matches.length} matching categories`);

    if (matches.length > 0) {
      const suggestion = {
        id: matches[0]._id.toString(),
        name: matches[0].name,
        type: matches[0].type,
        confidence: matches.length === 1 ? 'high' : 'medium'
      };

      console.log(`✅ Category suggestion:`, suggestion);
      res.json({ success: true, suggestion });
    } else {
      console.log(`🔍 No category suggestions found for: "${description}"`);
      res.json({ success: true, suggestion: null });
    }
  } catch (err) {
    console.error('❌ suggestCategory error:', err.name, '-', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to suggest category',
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        name: err.name,
        stack: err.stack
      } : undefined
    });
  }
};