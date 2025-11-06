// controllers/splitExpenseController.js - FIXED: Proper User ID extraction
import SplitExpense from '../models/splitExpenseModel.js';
import Friend from '../models/Friend.js';
import User from '../models/User.js';
import Debt from '../models/Debt.js';
import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

/**
 * Create a new split expense with automatic debt creation and notifications
 */
export const createSplitExpense = async (req, res) => {
  try {
    const { description, totalAmount, paidBy, splits, splitType = 'equal' } = req.body;
    const userId = req.user._id;

    console.log('🔵 Creating split expense for user:', userId);
    console.log('📋 Request data:', { description, totalAmount, paidBy, splitsCount: splits?.length, splitType });

    // Validation
    if (!description || !totalAmount || !splits || splits.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: description, totalAmount, and splits are required'
      });
    }

    // Validate amount
    const numTotalAmount = parseFloat(totalAmount);
    if (isNaN(numTotalAmount) || numTotalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Total amount must be a positive number'
      });
    }

    // ============================
    // CRITICAL: Get User IDs from Friend documents
    // ============================
    const validatedSplits = [];
    const friendUserMap = new Map(); // Map Friend ID -> User ID
    
    console.log('🔍 Processing splits and extracting User IDs...');
    
    for (const split of splits) {
      if (split.friendId) {
        console.log(`\n🔎 Checking Friend ID: ${split.friendId}`);
        
        // Find the Friend document and populate the actual User
        const friend = await Friend.findOne({
          _id: split.friendId,
          user: userId,
          status: 'active'
        }).populate('friendUser', '_id name email');

        if (!friend) {
          console.warn(`⚠️ Friend not found or inactive: ${split.friendId}`);
          continue;
        }

        console.log('📋 Friend document found:', {
          friendDocId: friend._id,
          friendName: friend.name,
          friendEmail: friend.email,
          hasPopulatedUser: !!friend.friendUser,
          friendUserType: typeof friend.friendUser
        });

        // Extract the actual User ID
        let actualUserId = null;

        // Method 1: friendUser is populated (object)
        if (friend.friendUser && typeof friend.friendUser === 'object' && friend.friendUser._id) {
          actualUserId = friend.friendUser._id;
          console.log(`✅ Method 1: Got User ID from populated friendUser object: ${actualUserId}`);
        }
        // Method 2: friendUser is just an ObjectId string
        else if (friend.friendUser && typeof friend.friendUser === 'string') {
          actualUserId = friend.friendUser;
          console.log(`✅ Method 2: Got User ID from friendUser string: ${actualUserId}`);
        }
        // Method 3: Check other possible fields
        else if (friend.userId) {
          actualUserId = friend.userId;
          console.log(`✅ Method 3: Got User ID from userId field: ${actualUserId}`);
        }
        else if (friend.user && friend.user.toString() !== userId.toString()) {
          // friend.user is the current user, not the friend's user
          console.log(`⏭️ Skipping: friend.user is the current user, not friend's User ID`);
          continue;
        }

        if (!actualUserId) {
          console.error(`❌ CRITICAL: Could not extract User ID from Friend document!`);
          console.error('Friend document structure:', JSON.stringify(friend, null, 2));
          continue;
        }

        // Verify the User actually exists
        const userExists = await User.findById(actualUserId).select('_id name email');
        if (!userExists) {
          console.error(`❌ User not found for ID: ${actualUserId}`);
          continue;
        }

        console.log(`✅ Verified User exists: ${userExists.name} (${userExists.email})`);

        // Store mapping
        friendUserMap.set(split.friendId, actualUserId);

        validatedSplits.push({
          friendId: split.friendId,
          userId: actualUserId,
          amount: parseFloat(split.amount),
          name: friend.name || userExists.name,
          email: friend.email || userExists.email
        });

        console.log(`✅ Validated split: ${friend.name} -> User ID: ${actualUserId}`);
      } 
      else if (split.email) {
        validatedSplits.push({
          email: split.email,
          amount: parseFloat(split.amount)
        });
        console.log(`✅ Added email-only split: ${split.email}`);
      }
    }

    console.log(`\n📊 Validation complete: ${validatedSplits.length} valid splits`);
    console.log(`📊 User ID mappings: ${friendUserMap.size} mappings created`);

    if (validatedSplits.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid friends found for this expense'
      });
    }

    // Calculate equal splits if needed
    if (splitType === 'equal') {
      const totalPeople = validatedSplits.length + 1;
      const amountPerPerson = parseFloat((numTotalAmount / totalPeople).toFixed(2));
      validatedSplits.forEach(split => {
        split.amount = amountPerPerson;
      });
      console.log(`📊 Equal split: ₹${amountPerPerson} per person (${totalPeople} people)`);
    }

    // Determine who paid (User ID)
    const paidByUserId = paidBy && paidBy !== 'self' ? paidBy : userId;
    
    // Get payer information
    const payer = await User.findById(paidByUserId).select('name email');
    const payerName = payer?.name || 'Someone';

    console.log(`💰 Paid by: ${payerName} (${paidByUserId})`);

    // Create the split expense
    const expense = new SplitExpense({
      description: description.trim(),
      totalAmount: numTotalAmount,
      paidBy: paidByUserId,
      createdBy: userId,
      splits: validatedSplits.map(split => ({
        friendId: split.friendId,
        email: split.email,
        amount: split.amount
      })),
      splitType,
      status: 'active'
    });

    await expense.save();
    console.log('✅ Split expense created:', expense._id);

    // ============================
    // CREATE DEBTS FOR EACH SPLIT
    // ============================
    const createdDebts = [];
    const debtErrors = [];

    console.log('\n💰 Creating debts...');

    for (const split of validatedSplits) {
      try {
        // Skip if no User ID (email-only splits)
        if (!split.userId) {
          console.log(`⏭️ Skipping debt creation for email-only split: ${split.email}`);
          continue;
        }

        // Determine creditor and debtor based on who paid
        let creditor, debtor;
        
        if (paidByUserId.toString() === userId.toString()) {
          // Current user paid, so this friend owes the current user
          creditor = userId;
          debtor = split.userId;
          console.log(`📝 Debt: ${split.name} owes current user ₹${split.amount}`);
        } else if (paidByUserId.toString() === split.userId.toString()) {
          // This friend paid, so current user owes this friend
          creditor = split.userId;
          debtor = userId;
          console.log(`📝 Debt: Current user owes ${split.name} ₹${split.amount}`);
        } else {
          // Another friend paid, this friend owes that friend
          creditor = paidByUserId;
          debtor = split.userId;
          console.log(`📝 Debt: ${split.name} owes payer ₹${split.amount}`);
        }

        // Create debt record
        const debt = new Debt({
          creditor: creditor,
          debtor: debtor,
          amount: split.amount,
          description: `Split: ${description.trim()}`,
          status: 'pending',
          type: 'split',
          relatedExpenseId: expense._id,
          metadata: {
            splitExpenseId: expense._id,
            category: 'split_expense',
            originalAmount: numTotalAmount,
            splitType: splitType,
            notes: `From split expense: ${description.trim()}`
          }
        });

        await debt.save();
        createdDebts.push(debt);
        
        console.log(`✅ Debt created: ID ${debt._id}`);
      } catch (debtError) {
        console.error(`❌ Error creating debt for ${split.name}:`, debtError.message);
        debtErrors.push({
          friendId: split.friendId,
          error: debtError.message
        });
      }
    }

    console.log(`\n📊 Debt creation summary: ${createdDebts.length} created, ${debtErrors.length} errors`);

    // ============================
    // SEND NOTIFICATIONS TO FRIENDS
    // ============================
    const notifications = [];
    const notificationErrors = [];

    console.log('\n📧 Sending notifications...');

    for (const split of validatedSplits) {
      try {
        // Skip if no User ID
        if (!split.userId) {
          console.log(`⏭️ Skipping notification for email-only split: ${split.email}`);
          continue;
        }

        // Skip if trying to notify current user (shouldn't happen, but safety check)
        if (split.userId.toString() === userId.toString()) {
          console.log(`⏭️ Skipping self-notification`);
          continue;
        }

        console.log(`📤 Creating notification for ${split.name} (User ID: ${split.userId})`);

        const notification = new Notification({
          userId: split.userId, // THIS IS THE KEY: Using actual User ID, not Friend ID
          senderId: userId,
          type: 'expense_created',
          title: '💰 New Split Expense',
          message: `${payerName} added you to "${description.trim()}". Your share: ₹${split.amount.toFixed(2)}`,
          relatedId: expense._id,
          relatedModel: 'SplitExpense',
          data: {
            description: description.trim(),
            amount: split.amount,
            paidBy: payerName,
            yourShare: split.amount.toFixed(2),
            totalAmount: numTotalAmount
          },
          priority: 'normal',
          actionUrl: `/expenses/${expense._id}`,
          read: false
        });

        await notification.save();
        notifications.push(notification);
        
        console.log(`✅ Notification sent to ${split.name}`);
      } catch (notifError) {
        console.error(`❌ Error creating notification for ${split.name}:`, notifError.message);
        notificationErrors.push({
          friendId: split.friendId,
          userId: split.userId,
          error: notifError.message
        });
      }
    }

    console.log(`\n📊 Notification summary: ${notifications.length} sent, ${notificationErrors.length} errors`);

    // Populate expense for response
    await expense.populate([
      { path: 'paidBy', select: 'name email' },
      { path: 'createdBy', select: 'name email' },
      { path: 'splits.friendId', select: 'name email' }
    ]);

    console.log('\n✅ Split expense creation complete!\n');

    // Return response with summary
    res.status(201).json({
      success: true,
      message: 'Split expense created successfully',
      expense: expense,
      summary: {
        debtsCreated: createdDebts.length,
        notificationsSent: notifications.length,
        totalAmount: numTotalAmount,
        splits: validatedSplits.length
      },
      warnings: {
        debtErrors: debtErrors.length > 0 ? debtErrors : undefined,
        notificationErrors: notificationErrors.length > 0 ? notificationErrors : undefined
      }
    });

  } catch (error) {
    console.error('❌ Error creating split expense:', error);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create split expense',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get all split expenses for the authenticated user
 */
export const getSplitExpenses = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, limit = 50, skip = 0 } = req.query;

    console.log('📋 Fetching split expenses for user:', userId);

    const query = {
      $or: [
        { createdBy: userId },
        { paidBy: userId },
        { 'splits.friendId': userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    const expenses = await SplitExpense.find(query)
      .populate('paidBy', 'name email userId')
      .populate('createdBy', 'name email userId')
      .populate('splits.friendId', 'name email userId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    console.log(`✅ Found ${expenses.length} expenses`);

    res.json({
      success: true,
      expenses: expenses,
      count: expenses.length
    });

  } catch (error) {
    console.error('❌ Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
};

/**
 * Get expense summary/dashboard
 */
export const getSplitExpensesSummary = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log('📊 Fetching expense summary for user:', userId);

    const expensesPaid = await SplitExpense.find({
      paidBy: userId,
      status: 'active'
    }).lean();

    const expensesOwed = await SplitExpense.find({
      'splits.friendId': userId,
      status: 'active'
    }).lean();

    let totalLent = 0;
    expensesPaid.forEach(expense => {
      expense.splits.forEach(split => {
        totalLent += split.amount;
      });
    });

    let totalOwed = 0;
    expensesOwed.forEach(expense => {
      expense.splits.forEach(split => {
        if (split.friendId && split.friendId.toString() === userId.toString()) {
          totalOwed += split.amount;
        }
      });
    });

    const summary = {
      totalLent: totalLent.toFixed(2),
      totalOwed: totalOwed.toFixed(2),
      netBalance: (totalLent - totalOwed).toFixed(2),
      totalExpenses: expensesPaid.length + expensesOwed.length,
      activeExpenses: expensesPaid.length + expensesOwed.length
    };

    console.log('✅ Summary calculated:', summary);

    res.json({
      success: true,
      summary: summary
    });

  } catch (error) {
    console.error('❌ Error calculating summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get expense summary',
      error: error.message
    });
  }
};

/**
 * Update split expense status
 */
export const updateSplitExpenseStatus = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    console.log('🔄 Updating expense status:', expenseId, 'to', status);

    if (!['active', 'settled', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const expense = await SplitExpense.findById(expenseId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    const hasPermission = 
      expense.createdBy.toString() === userId.toString() ||
      expense.paidBy.toString() === userId.toString();

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this expense'
      });
    }

    if (status === 'settled' || status === 'cancelled') {
      await Debt.updateMany(
        { relatedExpenseId: expenseId, status: 'pending' },
        { 
          status: status === 'settled' ? 'paid' : 'cancelled',
          paidAt: status === 'settled' ? new Date() : null,
          updatedAt: new Date()
        }
      );
      
      console.log(`✅ Updated related debts to ${status}`);
    }

    expense.status = status;
    if (status === 'settled') {
      expense.settledDate = new Date();
    }

    await expense.save();

    await expense.populate([
      { path: 'paidBy', select: 'name email' },
      { path: 'createdBy', select: 'name email' },
      { path: 'splits.friendId', select: 'name email' }
    ]);

    console.log('✅ Expense status updated');

    res.json({
      success: true,
      message: 'Expense status updated successfully',
      expense: expense
    });

  } catch (error) {
    console.error('❌ Error updating expense status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense status',
      error: error.message
    });
  }
};

export default {
  createSplitExpense,
  getSplitExpenses,
  getSplitExpensesSummary,
  updateSplitExpenseStatus
};