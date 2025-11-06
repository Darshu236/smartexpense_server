// routes/expenses.js - Enhanced backend routes
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Expense = require('../models/Expense');
const Debt = require('../models/Debt');
const notificationService = require('../services/notificationService');
const auth = require('../middleware/auth');

// Create split expense with notifications and debt creation
router.post('/split', auth, async (req, res) => {
  try {
    const {
      description,
      totalAmount,
      currency = 'INR',
      splits,
      paidBy,
      extractedData,
      sendNotifications = true
    } = req.body;

    // Input validation
    if (!description?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Description is required'
      });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid total amount is required'
      });
    }

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one split is required'
      });
    }

    if (!paidBy) {
      return res.status(400).json({
        success: false,
        message: 'Paid by is required'
      });
    }

    // Validate that paidBy user exists
    const payer = await User.findById(paidBy);
    if (!payer) {
      return res.status(404).json({
        success: false,
        message: 'Payer not found'
      });
    }

    // Validate all split participants exist
    const participantIds = splits.map(split => split.friendId);
    const participants = await User.find({ _id: { $in: participantIds } });
    
    if (participants.length !== participantIds.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more participants not found'
      });
    }

    // Validate split amounts
    const splitTotal = splits.reduce((sum, split) => sum + parseFloat(split.amount), 0);
    const tolerance = 0.01;
    
    if (Math.abs(splitTotal - parseFloat(totalAmount)) > tolerance) {
      return res.status(400).json({
        success: false,
        message: `Split amounts (${splitTotal}) don't match total amount (${totalAmount})`
      });
    }

    // Create the expense record
    const expense = new Expense({
      description: description.trim(),
      totalAmount: parseFloat(totalAmount),
      currency,
      paidBy,
      participants: participantIds,
      splits: splits.map(split => ({
        userId: split.friendId,
        amount: parseFloat(split.amount)
      })),
      extractedData: extractedData || null,
      type: 'split',
      status: 'active',
      createdBy: req.user.id,
      createdAt: new Date()
    });

    const savedExpense = await expense.save();

    // Create debt records for each participant (except the payer)
    const debtsToCreate = [];
    const notificationsToSend = [];

    for (const split of splits) {
      // Skip creating debt for the payer
      if (split.friendId === paidBy) {
        continue;
      }

      const participant = participants.find(p => p._id.toString() === split.friendId);
      
      const debtData = {
        creditorId: paidBy,
        debtorId: split.friendId,
        amount: parseFloat(split.amount),
        currency,
        description: `Split: ${description.trim()}`,
        type: 'split',
        status: 'pending',
        originalExpenseId: savedExpense._id,
        createdAt: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      };

      debtsToCreate.push(debtData);
      
      // Prepare notification data
      if (sendNotifications && participant) {
        notificationsToSend.push({
          expense: {
            _id: savedExpense._id,
            description: description.trim(),
            amount: split.amount,
            totalAmount: parseFloat(totalAmount),
            currency,
            createdAt: savedExpense.createdAt
          },
          debtor: participant,
          creditor: payer
        });
      }
    }

    // Bulk create debts
    let createdDebts = [];
    if (debtsToCreate.length > 0) {
      createdDebts = await Debt.insertMany(debtsToCreate);
    }

    // Send notifications asynchronously
    if (sendNotifications && notificationsToSend.length > 0) {
      // Don't await - send notifications in background
      setImmediate(async () => {
        for (const notification of notificationsToSend) {
          try {
            await notificationService.sendExpenseSplitNotification(
              notification.expense,
              notification.debtor,
              notification.creditor
            );
          } catch (error) {
            console.error('Failed to send notification:', error);
            // Continue with other notifications even if one fails
          }
        }
      });
    }

    console.log(`✅ Split expense created: ${savedExpense._id}, ${createdDebts.length} debts created`);

    res.status(201).json({
      success: true,
      message: 'Expense split created successfully',
      data: {
        expense: savedExpense,
        debtsCreated: createdDebts.length,
        participantsNotified: notificationsToSend.length
      }
    });

  } catch (error) {
    console.error('❌ Error creating split expense:', error);
    
    // Provide more specific error messages
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate expense detected'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create split expense',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get expense history
router.get('/', auth, async (req, res) => {
  try {
    const { limit = 50, offset = 0, type, status } = req.query;
    
    const query = {
      $or: [
        { createdBy: req.user.id },
        { paidBy: req.user.id },
        { participants: req.user.id }
      ]
    };

    if (type) query.type = type;
    if (status) query.status = status;

    const expenses = await Expense.find(query)
      .populate('paidBy', 'name email')
      .populate('participants', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Expense.countDocuments(query);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses'
    });
  }
});

// Send notification for expense
router.post('/:expenseId/notify', auth, async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { recipients, type = 'expense_split' } = req.body;

    const expense = await Expense.findById(expenseId)
      .populate('paidBy', 'name email')
      .populate('participants', 'name email');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Verify user has permission to send notifications for this expense
    if (expense.createdBy.toString() !== req.user.id && 
        expense.paidBy._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send notifications for this expense'
      });
    }

    // Send notifications to specified recipients or all participants
    const targetRecipients = recipients || expense.participants.map(p => p._id.toString());
    let notificationsSent = 0;

    for (const recipientId of targetRecipients) {
      try {
        const recipient = expense.participants.find(p => p._id.toString() === recipientId);
        if (!recipient) continue;

        await notificationService.sendExpenseSplitNotification(
          {
            _id: expense._id,
            description: expense.description,
            currency: expense.currency,
            createdAt: expense.createdAt
          },
          recipient,
          expense.paidBy
        );

        notificationsSent++;
      } catch (error) {
        console.error(`Failed to send notification to ${recipientId}:`, error);
      }
    }

    res.json({
      success: true,
      message: `${notificationsSent} notifications sent successfully`
    });

  } catch (error) {
    console.error('Error sending expense notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications'
    });
  }
});

// Batch create debts (used internally)
router.post('/debts/batch', auth, async (req, res) => {
  try {
    const { debts, sendNotifications = true } = req.body;

    if (!debts || !Array.isArray(debts) || debts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debts array is required'
      });
    }

    // Validate all debt data
    for (const debt of debts) {
      if (!debt.creditorId || !debt.debtorId || !debt.amount || debt.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Each debt must have creditorId, debtorId, and valid amount'
        });
      }
    }

    // Create debts
    const createdDebts = await Debt.insertMany(debts);

    // Send notifications if requested
    if (sendNotifications) {
      setImmediate(async () => {
        for (const debt of createdDebts) {
          try {
            const [creditor, debtor] = await Promise.all([
              User.findById(debt.creditorId),
              User.findById(debt.debtorId)
            ]);

            if (creditor && debtor) {
              await notificationService.sendExpenseSplitNotification(
                {
                  _id: debt._id,
                  description: debt.description,
                  amount: debt.amount,
                  totalAmount: debt.amount,
                  currency: debt.currency,
                  createdAt: debt.createdAt
                },
                debtor,
                creditor
              );
            }
          } catch (error) {
            console.error('Failed to send debt notification:', error);
          }
        }
      });
    }

    res.status(201).json({
      success: true,
      message: 'Debts created successfully',
      data: {
        debts: createdDebts,
        count: createdDebts.length
      }
    });

  } catch (error) {
    console.error('Error creating batch debts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create debts'
    });
  }
});

// Get expense by ID
router.get('/:expenseId', auth, async (req, res) => {
  try {
    const { expenseId } = req.params;

    const expense = await Expense.findById(expenseId)
      .populate('paidBy', 'name email')
      .populate('participants', 'name email')
      .populate('createdBy', 'name email');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check if user has access to this expense
    const hasAccess = expense.createdBy._id.toString() === req.user.id ||
                     expense.paidBy._id.toString() === req.user.id ||
                     expense.participants.some(p => p._id.toString() === req.user.id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this expense'
      });
    }

    res.json({
      success: true,
      data: expense
    });

  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense'
    });
  }
});

// Update expense status
router.put('/:expenseId/status', auth, async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { status } = req.body;

    if (!['active', 'settled', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, settled, or cancelled'
      });
    }

    const expense = await Expense.findById(expenseId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check authorization
    if (expense.createdBy.toString() !== req.user.id && 
        expense.paidBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this expense'
      });
    }

    expense.status = status;
    expense.updatedAt = new Date();
    await expense.save();

    // Update related debts if settling or cancelling
    if (status === 'settled') {
      await Debt.updateMany(
        { originalExpenseId: expenseId },
        { status: 'paid', paidAt: new Date() }
      );
    } else if (status === 'cancelled') {
      await Debt.updateMany(
        { originalExpenseId: expenseId },
        { status: 'cancelled', updatedAt: new Date() }
      );
    }

    res.json({
      success: true,
      message: `Expense ${status} successfully`,
      data: expense
    });

  } catch (error) {
    console.error('Error updating expense status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense status'
    });
  }
});

// Delete expense (soft delete)
router.delete('/:expenseId', auth, async (req, res) => {
  try {
    const { expenseId } = req.params;

    const expense = await Expense.findById(expenseId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check authorization - only creator can delete
    if (expense.createdBy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the expense creator can delete this expense'
      });
    }

    // Soft delete
    expense.status = 'deleted';
    expense.deletedAt = new Date();
    await expense.save();

    // Cancel related debts
    await Debt.updateMany(
      { originalExpenseId: expenseId },
      { status: 'cancelled', updatedAt: new Date() }
    );

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense'
    });
  }
});

module.exports = router;