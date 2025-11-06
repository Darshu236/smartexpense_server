import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

// Define separate categories for expense and income
const EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Entertainment', 'Healthcare',
  'Bills', 'Education', 'Travel', 'Investment', 'Other'
];

const INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Business', 'Investment', 'Bonus',
  'Gift', 'Refund', 'Side Hustle', 'Dividend', 'Other'
];

// Combined categories for validation
const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];

// GET all transactions for a user
export const getTransactions = async (req, res) => {
  console.log('🔍 getTransactions called for user:', req.user?.id);
  
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }

    const transactions = await Transaction.find({ user: req.user.id })
      .sort({ date: -1, createdAt: -1 }); // Sort by date descending, then by createdAt

    console.log(`✅ Found ${transactions.length} transactions for user ${req.user.id}`);

    res.json({
      success: true,
      transactions: transactions,
      count: transactions.length
    });
    
  } catch (error) {
    console.error('💥 Error in getTransactions:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch transactions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ADD new transaction
export const addTransaction = async (req, res) => {
  console.log('🔍 =========================');
  console.log('🔍 addTransaction called');
  console.log('🔍 Request body:', JSON.stringify(req.body, null, 2));
  console.log('🔍 req.user:', JSON.stringify(req.user, null, 2));
  console.log('🔍 =========================');
  
  try {
    // Step 1: Check user authentication
    console.log('Step 1: Checking authentication...');
    if (!req.user || !req.user.id) {
      console.log('❌ No user found in request');
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }
    console.log('✅ User authenticated:', req.user.id);

    // Step 2: Extract and log data
    console.log('Step 2: Extracting data...');
    const { amount, description, title, category, type, date, paymentMode } = req.body;
    const userId = req.user.id;
    
    console.log('🔍 Raw extracted data:', {
      userId,
      amount: { value: amount, type: typeof amount },
      description: { value: description, type: typeof description },
      title: { value: title, type: typeof title },
      category: { value: category, type: typeof category },
      type: { value: type, type: typeof type },
      paymentMode: { value: paymentMode, type: typeof paymentMode },
      date: { value: date, type: typeof date }
    });

    // Step 3: Validate and prepare description
    console.log('Step 3: Validating description...');
    const transactionDescription = description || title;
    if (!transactionDescription || transactionDescription.trim() === '') {
      console.log('❌ Missing or empty description');
      return res.status(400).json({ 
        success: false, 
        error: 'Description or title is required' 
      });
    }
    console.log('✅ Description valid:', transactionDescription);

    // Step 4: Validate amount
    console.log('Step 4: Validating amount...');
    const numericAmount = parseFloat(amount);
    console.log('🔍 Amount conversion:', { 
      original: amount, 
      parsed: numericAmount, 
      isNaN: isNaN(numericAmount),
      isPositive: numericAmount > 0
    });
    
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      console.log('❌ Invalid amount:', { amount, numericAmount });
      return res.status(400).json({ 
        success: false, 
        error: 'Amount must be a positive number' 
      });
    }
    console.log('✅ Amount valid:', numericAmount);

    // Step 5: Validate transaction type first
    console.log('Step 5: Validating transaction type...');
    const validTypes = ['income', 'expense'];
    const finalType = type && validTypes.includes(type) ? type : 'expense';
    console.log('✅ Type processed:', { provided: type, final: finalType });

    // Step 6: Validate category based on transaction type
    console.log('Step 6: Validating category based on transaction type...');
    let validCategories = ALL_CATEGORIES; // Default to all categories
    let categoryTypeMessage = 'all types';

    // Get the appropriate categories based on transaction type
    if (finalType === 'expense') {
      validCategories = EXPENSE_CATEGORIES;
      categoryTypeMessage = 'expense transactions';
    } else if (finalType === 'income') {
      validCategories = INCOME_CATEGORIES;
      categoryTypeMessage = 'income transactions';
    }

    console.log('🔍 Category validation:', {
      transactionType: finalType,
      providedCategory: category,
      validCategories: validCategories,
      isValid: validCategories.includes(category)
    });
    
    if (!category || !validCategories.includes(category)) {
      console.log('❌ Invalid or missing category:', category);
      return res.status(400).json({ 
        success: false, 
        error: `Category "${category}" is not valid for ${categoryTypeMessage}. Valid categories: ${validCategories.join(', ')}` 
      });
    }
    console.log('✅ Category valid for', categoryTypeMessage, ':', category);
    
    // Step 7: Validate payment mode
    console.log('Step 7: Validating payment mode...');
    const validPaymentModes = ['wallet', 'cash', 'card', 'bank'];
    const finalPaymentMode = paymentMode && validPaymentModes.includes(paymentMode) ? paymentMode : 'wallet';
    console.log('✅ Payment mode processed:', { provided: paymentMode, final: finalPaymentMode });

    // Step 8: Validate user ID
    console.log('Step 8: Validating user ID...');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('❌ Invalid user ID format:', userId);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user ID format' 
      });
    }
    console.log('✅ User ID format valid:', userId);

    // Step 9: Check if user exists in database
    console.log('Step 9: Checking if user exists in database...');
    const userExists = await User.findById(userId);
    if (!userExists) {
      console.log('❌ User not found in database with ID:', userId);
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    console.log('✅ User found in database:', {
      id: userExists._id,
      email: userExists.email,
      name: userExists.name
    });

    // Step 10: Prepare transaction data
    console.log('Step 10: Preparing transaction data...');
    const transactionData = {
      user: userId,
      amount: numericAmount,
      description: transactionDescription.trim(),
      category: category,
      type: finalType,
      paymentMode: finalPaymentMode,
      date: date ? new Date(date) : new Date()
    };

    console.log('🔍 Final transaction data:', JSON.stringify(transactionData, null, 2));

    // Step 11: Test transaction creation (without saving first)
    console.log('Step 11: Creating transaction instance...');
    const transaction = new Transaction(transactionData);
    console.log('✅ Transaction instance created');

    // Step 12: Validate transaction
    console.log('Step 12: Validating transaction...');
    const validationError = transaction.validateSync();
    if (validationError) {
      console.log('❌ Validation error:', validationError.errors);
      const validationErrors = Object.values(validationError.errors).map(err => err.message);
      console.log('❌ Validation error messages:', validationErrors);
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed: ' + validationErrors.join(', ')
      });
    }
    console.log('✅ Transaction validation passed');

    // Step 13: Save transaction
    console.log('Step 13: Saving transaction to database...');
    const savedTransaction = await transaction.save();
    console.log('✅ Transaction saved successfully with ID:', savedTransaction._id);

    // Step 14: Prepare response
    console.log('Step 14: Preparing response...');
    const responseData = {
      success: true,
      message: 'Transaction created successfully',
      transaction: {
        id: savedTransaction._id,
        _id: savedTransaction._id,
        amount: savedTransaction.amount,
        description: savedTransaction.description,
        title: savedTransaction.description,
        category: savedTransaction.category,
        type: savedTransaction.type,
        date: savedTransaction.date,
        paymentMode: savedTransaction.paymentMode,
        createdAt: savedTransaction.createdAt,
        updatedAt: savedTransaction.updatedAt
      }
    };

    console.log('✅ Transaction creation completed successfully');
    res.status(201).json(responseData);
    
  } catch (error) {
    console.error("💥 ===============================");
    console.error("💥 CRITICAL ERROR in addTransaction");
    console.error("💥 ===============================");
    console.error("💥 Error name:", error.name);
    console.error("💥 Error message:", error.message);
    console.error("💥 Error stack:", error.stack);
    
    if (error.errors) {
      console.error("💥 Validation errors:", error.errors);
    }
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed: ' + validationErrors.join(', ')
      });
    }
    
    if (error.name === 'MongoServerError' && error.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        error: 'Duplicate transaction detected' 
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid ${error.path}: ${error.value}` 
      });
    }

    // Generic server error
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while creating transaction',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// UPDATE transaction
export const updateTransaction = async (req, res) => {
  console.log('✏️ updateTransaction called');
  console.log('✏️ Transaction ID:', req.params.id);
  console.log('✏️ User:', req.user?.id);
  console.log('✏️ Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }

    const transactionId = req.params.id;
    
    // Validate transaction ID format
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      console.log('❌ Invalid transaction ID format:', transactionId);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid transaction ID format' 
      });
    }

    // Extract update data
    const { amount, description, title, category, type, date, paymentMode } = req.body;
    
    // Build update object with only provided fields
    const updateData = {};
    
    // Validate and set description
    if (description !== undefined || title !== undefined) {
      const transactionDescription = description || title;
      if (!transactionDescription || transactionDescription.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          error: 'Description cannot be empty' 
        });
      }
      updateData.description = transactionDescription.trim();
    }
    
    // Validate and set amount
    if (amount !== undefined) {
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Amount must be a positive number' 
        });
      }
      updateData.amount = numericAmount;
    }
    
    // Validate and set transaction type
    if (type !== undefined) {
      const validTypes = ['income', 'expense'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          success: false, 
          error: `Type must be one of: ${validTypes.join(', ')}` 
        });
      }
      updateData.type = type;
    }
    
    // Validate category based on type (if both are being updated or if category is being updated)
    if (category !== undefined) {
      // Get the transaction type (either from update data or existing transaction)
      let transactionType = updateData.type;
      if (!transactionType) {
        // Need to fetch existing transaction to get current type
        const existingTransaction = await Transaction.findOne({
          _id: transactionId,
          user: req.user.id
        });
        
        if (!existingTransaction) {
          return res.status(404).json({ 
            success: false, 
            error: 'Transaction not found or you do not have permission to update it' 
          });
        }
        
        transactionType = existingTransaction.type;
      }
      
      // Validate category based on transaction type
      let validCategories = ALL_CATEGORIES;
      let categoryTypeMessage = 'all types';
      
      if (transactionType === 'expense') {
        validCategories = EXPENSE_CATEGORIES;
        categoryTypeMessage = 'expense transactions';
      } else if (transactionType === 'income') {
        validCategories = INCOME_CATEGORIES;
        categoryTypeMessage = 'income transactions';
      }
      
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          success: false, 
          error: `Category "${category}" is not valid for ${categoryTypeMessage}. Valid categories: ${validCategories.join(', ')}` 
        });
      }
      
      updateData.category = category;
    }
    
    // Validate and set payment mode
    if (paymentMode !== undefined) {
      const validPaymentModes = ['wallet', 'cash', 'card', 'bank'];
      if (!validPaymentModes.includes(paymentMode)) {
        return res.status(400).json({ 
          success: false, 
          error: `Payment mode must be one of: ${validPaymentModes.join(', ')}` 
        });
      }
      updateData.paymentMode = paymentMode;
    }
    
    // Set date
    if (date !== undefined) {
      updateData.date = new Date(date);
    }
    
    // Update the updatedAt timestamp
    updateData.updatedAt = new Date();
    
    console.log('🔍 Update data:', JSON.stringify(updateData, null, 2));
    
    // Find and update transaction (only if it belongs to the user)
    const updatedTransaction = await Transaction.findOneAndUpdate(
      {
        _id: transactionId,
        user: req.user.id
      },
      updateData,
      { 
        new: true, // Return the updated document
        runValidators: true // Run schema validators
      }
    );

    if (!updatedTransaction) {
      console.log('❌ Transaction not found or not owned by user');
      return res.status(404).json({ 
        success: false, 
        error: 'Transaction not found or you do not have permission to update it' 
      });
    }

    console.log('✅ Transaction updated successfully:', updatedTransaction._id);

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      transaction: {
        id: updatedTransaction._id,
        _id: updatedTransaction._id,
        amount: updatedTransaction.amount,
        description: updatedTransaction.description,
        title: updatedTransaction.description,
        category: updatedTransaction.category,
        type: updatedTransaction.type,
        date: updatedTransaction.date,
        paymentMode: updatedTransaction.paymentMode,
        createdAt: updatedTransaction.createdAt,
        updatedAt: updatedTransaction.updatedAt
      }
    });
    
  } catch (error) {
    console.error('💥 Error in updateTransaction:', error);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        error: 'Validation failed: ' + validationErrors.join(', ')
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid ${error.path}: ${error.value}` 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update transaction',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// DELETE transaction
export const deleteTransaction = async (req, res) => {
  console.log('🗑️ deleteTransaction called');
  console.log('🗑️ Transaction ID:', req.params.id);
  console.log('🗑️ User:', req.user?.id);
  
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }

    const transactionId = req.params.id;
    
    // Validate transaction ID format
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      console.log('❌ Invalid transaction ID format:', transactionId);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid transaction ID format' 
      });
    }

    // Find and delete transaction (only if it belongs to the user)
    const deletedTransaction = await Transaction.findOneAndDelete({
      _id: transactionId,
      user: req.user.id
    });

    if (!deletedTransaction) {
      console.log('❌ Transaction not found or not owned by user');
      return res.status(404).json({ 
        success: false, 
        error: 'Transaction not found or you do not have permission to delete it' 
      });
    }

    console.log('✅ Transaction deleted successfully:', deletedTransaction._id);

    res.json({
      success: true,
      message: 'Transaction deleted successfully',
      deletedTransaction: {
        id: deletedTransaction._id,
        description: deletedTransaction.description,
        amount: deletedTransaction.amount
      }
    });
    
  } catch (error) {
    console.error('💥 Error in deleteTransaction:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete transaction',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Utility function to get available categories for a transaction type
export const getAvailableCategories = async (req, res) => {
  try {
    const { type } = req.query;
    
    let categories = ALL_CATEGORIES;
    
    if (type === 'expense') {
      categories = EXPENSE_CATEGORIES;
    } else if (type === 'income') {
      categories = INCOME_CATEGORIES;
    }
    
    res.json({
      success: true,
      categories: categories,
      type: type || 'all'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
};

// Placeholder functions for ML features (you can implement these later)
export const getMLInsights = async (req, res) => {
  res.json({ 
    success: true, 
    message: 'ML Insights feature coming soon',
    insights: []
  });
};

export const predictCategory = async (req, res) => {
  res.json({ 
    success: true, 
    message: 'Category prediction feature coming soon',
    predictedCategory: 'Other'
  });
};

export const getSpendingForecast = async (req, res) => {
  res.json({ 
    success: true, 
    message: 'Spending forecast feature coming soon',
    forecast: []
  });
};

export const getAnomalies = async (req, res) => {
  res.json({ 
    success: true, 
    message: 'Anomaly detection feature coming soon',
    anomalies: []
  });
};

export const getSpendingAnalysis = async (req, res) => {
  res.json({ 
    success: true, 
    message: 'Spending analysis feature coming soon',
    analysis: {}
  });
};

export const getBudgetRecommendations = async (req, res) => {
  res.json({ 
    success: true, 
    message: 'Budget recommendations feature coming soon',
    recommendations: []
  });
};