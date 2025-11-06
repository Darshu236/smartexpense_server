// routes/debtRoutes.js - FIXED VERSION WITH PROPER NOTIFICATIONS
import express from 'express';
import mongoose from 'mongoose';
import Debt from '../models/Debt.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// ============================
// CREATE DEBT - FIXED WITH NOTIFICATIONS ✅
// ============================
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('📝 Debt creation request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user._id);

    const { friendId, friendEmail, amount, description, type, dueDate } = req.body;
    const currentUserId = req.user._id;

    if (!req.body) {
      return res.status(400).json({
        success: false,
        message: 'Request body is required'
      });
    }

    if (!friendId && !friendEmail) {
      return res.status(400).json({
        success: false,
        message: 'Either friendId or friendEmail is required'
      });
    }

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required'
      });
    }

    if (!description) {
      return res.status(400).json({
        success: false,
        message: 'Description is required'
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Type is required'
      });
    }

    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number',
        received: { amount, parsed: numAmount }
      });
    }

    if (!['owe-me', 'i-owe'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be "owe-me" or "i-owe"',
        received: { type }
      });
    }

    console.log('✅ All validations passed');

    let friend;
    if (friendId) {
      console.log('Looking for friend by ID:', friendId);
      
      if (!mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid friend ID format'
        });
      }
      
      friend = await User.findById(friendId);
    } else {
      console.log('Looking for friend by email:', friendEmail);
      const cleanEmail = friendEmail.toLowerCase().trim();
      
      if (!cleanEmail.includes('@')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
      
      friend = await User.findOne({ email: cleanEmail });
    }
    
    if (!friend) {
      console.log('❌ Friend not found');
      return res.status(404).json({
        success: false,
        message: 'Friend not found'
      });
    }

    console.log('✅ Friend found:', friend.name);

    if (friend._id.toString() === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create debt with yourself'
      });
    }

    const debtData = {
      amount: numAmount,
      description: description.trim(),
      currency: 'INR',
      type: 'manual',
      status: 'pending'
    };

    if (type === 'owe-me') {
      debtData.creditor = currentUserId;
      debtData.debtor = friend._id;
    } else {
      debtData.creditor = friend._id;
      debtData.debtor = currentUserId;
    }

    if (dueDate) {
      debtData.dueDate = new Date(dueDate);
    }

    console.log('Creating debt:', debtData);

    const debt = new Debt(debtData);
    const savedDebt = await debt.save();

    console.log('✅ Debt saved:', savedDebt._id);

    const populatedDebt = await Debt.findById(savedDebt._id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    // ========================================
    // 🔔 CREATE NOTIFICATION FOR THE OTHER USER
    // ========================================
    try {
      let notificationRecipient, notificationTitle, notificationMessage;
      
      if (type === 'owe-me') {
        // Current user is creditor, friend is debtor - notify friend
        notificationRecipient = friend._id;
        notificationTitle = '💰 New Debt Added';
        notificationMessage = `${req.user.name} says you owe ₹${numAmount} for "${description.trim()}"`;
      } else {
        // Friend is creditor, current user is debtor - notify friend
        notificationRecipient = friend._id;
        notificationTitle = '💸 Debt Recorded';
        notificationMessage = `${req.user.name} recorded that they owe you ₹${numAmount} for "${description.trim()}"`;
      }

      await Notification.create({
        userId: notificationRecipient,
        senderId: currentUserId,
        type: 'debt_created',
        title: notificationTitle,
        message: notificationMessage,
        relatedId: savedDebt._id,
        relatedModel: 'Debt',
        read: false,
        priority: 'normal',
        data: {
          amount: numAmount,
          description: description.trim(),
          debtType: type,
          debtId: savedDebt._id.toString(),
          dueDate: dueDate || null
        },
        actionUrl: `/debts`
      });

      console.log('✅ Debt creation notification sent to:', friend.name);
    } catch (notifError) {
      console.error('⚠️ Failed to create debt notification:', notifError.message);
      // Don't fail the entire request if notification fails
    }

    console.log('✅ Success - returning debt');

    res.status(201).json({
      success: true,
      message: 'Debt created successfully',
      debt: populatedDebt
    });

  } catch (error) {
    console.error('❌ Error creating debt:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating debt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// GET DEBTS OWED TO ME
// ============================
router.get('/owed-to-me', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching debts owed to user:', req.user._id);
    
    const debts = await Debt.find({ 
      creditor: req.user._id, 
      status: { $ne: 'cancelled' } 
    })
      .populate('debtor', 'name email userId')
      .populate('creditor', 'name email userId')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${debts.length} debts owed to me`);

    res.status(200).json({
      success: true,
      debts,
      count: debts.length,
      totalAmount: debts.reduce((sum, debt) => sum + (debt.amount || 0), 0)
    });

  } catch (error) {
    console.error('❌ Error fetching debts owed to me:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debts owed to you',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// GET DEBTS OWED BY ME
// ============================
router.get('/owed-by-me', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching debts owed by user:', req.user._id);
    
    const debts = await Debt.find({ 
      debtor: req.user._id, 
      status: { $ne: 'cancelled' } 
    })
      .populate('debtor', 'name email userId')
      .populate('creditor', 'name email userId')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${debts.length} debts I owe`);

    res.status(200).json({
      success: true,
      debts,
      count: debts.length,
      totalAmount: debts.reduce((sum, debt) => sum + (debt.amount || 0), 0)
    });

  } catch (error) {
    console.error('❌ Error fetching debts I owe:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debts you owe',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// GET DEBT OVERVIEW
// ============================
router.get('/overview', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching debt overview for user:', req.user._id);

    const [debtsOwedToMe, debtsOwedByMe] = await Promise.all([
      Debt.find({ 
        creditor: req.user._id, 
        status: { $ne: 'cancelled' } 
      }).populate('debtor', 'name email userId'),
      
      Debt.find({ 
        debtor: req.user._id, 
        status: { $ne: 'cancelled' } 
      }).populate('creditor', 'name email userId')
    ]);

    const totalOwedToMe = debtsOwedToMe
      .filter(debt => debt.status === 'pending')
      .reduce((sum, debt) => sum + debt.amount, 0);

    const totalOwedByMe = debtsOwedByMe
      .filter(debt => debt.status === 'pending')
      .reduce((sum, debt) => sum + debt.amount, 0);

    const netBalance = totalOwedToMe - totalOwedByMe;

    console.log('✅ Overview calculated:', {
      owedToMe: totalOwedToMe,
      owedByMe: totalOwedByMe,
      netBalance
    });

    res.status(200).json({
      success: true,
      overview: {
        totalOwedToMe,
        totalOwedByMe,
        netBalance,
        debtsOwedToMeCount: debtsOwedToMe.filter(d => d.status === 'pending').length,
        debtsOwedByMeCount: debtsOwedByMe.filter(d => d.status === 'pending').length,
        paidDebtsCount: [...debtsOwedToMe, ...debtsOwedByMe].filter(d => d.status === 'paid').length
      },
      debtsOwedToMe,
      debtsOwedByMe
    });

  } catch (error) {
    console.error('❌ Error fetching debt overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debt overview',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// GET SINGLE DEBT BY ID
// ============================
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid debt ID format'
      });
    }

    const debt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Debt not found'
      });
    }

    // Check if user is involved in this debt
    const userId = req.user._id.toString();
    const isCreditor = debt.creditor._id.toString() === userId;
    const isDebtor = debt.debtor._id.toString() === userId;

    if (!isCreditor && !isDebtor) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this debt'
      });
    }

    res.status(200).json({
      success: true,
      debt
    });

  } catch (error) {
    console.error('❌ Error fetching debt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// UPDATE DEBT
// ============================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, dueDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid debt ID format'
      });
    }

    const debt = await Debt.findById(id)
      .populate('debtor', 'name email userId')
      .populate('creditor', 'name email userId');

    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Debt not found'
      });
    }

    // Only creditor can update the debt
    if (debt.creditor._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the creditor can update this debt'
      });
    }

    if (debt.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a debt that is not pending'
      });
    }

    const oldAmount = debt.amount;
    const oldDescription = debt.description;

    if (amount !== undefined) {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be a positive number'
        });
      }
      debt.amount = numAmount;
    }

    if (description !== undefined) {
      debt.description = description.trim();
    }

    if (dueDate !== undefined) {
      debt.dueDate = dueDate ? new Date(dueDate) : null;
    }

    await debt.save();

    const updatedDebt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    // 🔔 SEND UPDATE NOTIFICATION TO DEBTOR
    try {
      await Notification.create({
        userId: debt.debtor._id,
        senderId: req.user._id,
        type: 'expense_updated',
        title: '📝 Debt Updated',
        message: `${req.user.name} updated the debt "${debt.description}"${amount !== undefined ? ` (was ₹${oldAmount}, now ₹${debt.amount})` : ''}`,
        relatedId: debt._id,
        relatedModel: 'Debt',
        read: false,
        priority: 'normal',
        data: {
          oldAmount,
          newAmount: debt.amount,
          oldDescription,
          newDescription: debt.description,
          debtId: debt._id.toString()
        },
        actionUrl: `/debts`
      });
      console.log('✅ Debt update notification sent');
    } catch (notifError) {
      console.error('⚠️ Failed to create update notification:', notifError);
    }

    console.log('✅ Debt updated:', id);

    res.status(200).json({
      success: true,
      message: 'Debt updated successfully',
      debt: updatedDebt
    });

  } catch (error) {
    console.error('❌ Error updating debt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update debt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// MARK DEBT AS SETTLED (BY CREDITOR)
// ============================
router.patch('/:id/settle', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid debt ID format'
      });
    }

    const debt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Debt not found'
      });
    }

    // Only creditor can mark as paid
    if (debt.creditor._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the creditor can mark this debt as paid'
      });
    }

    if (debt.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Debt is already paid'
      });
    }

    debt.status = 'paid';
    debt.paidAt = new Date();
    await debt.save();

    const updatedDebt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    // 🔔 CREATE NOTIFICATION FOR DEBTOR
    try {
      await Notification.create({
        userId: debt.debtor._id,
        senderId: req.user._id,
        type: 'payment_received',
        title: '✅ Debt Confirmed as Paid',
        message: `${req.user.name} confirmed your payment of ₹${debt.amount} for "${debt.description}"`,
        relatedId: debt._id,
        relatedModel: 'Debt',
        read: false,
        priority: 'normal',
        data: {
          amount: debt.amount,
          description: debt.description,
          paidAt: debt.paidAt,
          debtId: debt._id.toString()
        },
        actionUrl: `/debts`
      });
      console.log('✅ Settlement notification sent to debtor');
    } catch (notifError) {
      console.error('⚠️ Failed to create settlement notification:', notifError);
    }

    console.log('✅ Debt marked as paid:', id);

    res.status(200).json({
      success: true,
      message: 'Debt marked as paid',
      debt: updatedDebt
    });

  } catch (error) {
    console.error('❌ Error marking debt as paid:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark debt as paid',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// MARK DEBT AS PAID (BY DEBTOR) 🔥
// ============================
router.patch('/:id/mark-paid', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;

    console.log('💳 Mark as paid request:', { id, paymentMethod, userId: req.user._id });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid debt ID format'
      });
    }

    const debt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    if (!debt) {
      console.log('❌ Debt not found:', id);
      return res.status(404).json({
        success: false,
        message: 'Debt not found'
      });
    }

    console.log('📋 Found debt:', {
      debtId: debt._id,
      creditor: debt.creditor._id,
      debtor: debt.debtor._id,
      status: debt.status,
      amount: debt.amount
    });

    // Only debtor can mark as paid
    if (debt.debtor._id.toString() !== req.user._id.toString()) {
      console.log('❌ Authorization failed - user is not the debtor');
      return res.status(403).json({
        success: false,
        message: 'Only the debtor can mark this debt as paid'
      });
    }

    if (debt.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Debt is already paid'
      });
    }

    // Update debt status
    console.log('✅ Updating debt status to paid');
    debt.status = 'paid';
    debt.paidAt = new Date();
    
    if (paymentMethod) {
      debt.paymentMethod = paymentMethod;
    }
    
    await debt.save();
    console.log('✅ Debt saved successfully');

    const updatedDebt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    // 🔔 CREATE NOTIFICATION FOR CREDITOR
    try {
      const paymentMethodText = paymentMethod ? ` via ${paymentMethod.replace('_', ' ')}` : '';
      
      await Notification.create({
        userId: debt.creditor._id,
        senderId: req.user._id,
        type: 'payment_received',
        title: '💰 Payment Received',
        message: `${req.user.name} paid you ₹${debt.amount} for "${debt.description}"${paymentMethodText}`,
        relatedId: debt._id,
        relatedModel: 'Debt',
        read: false,
        priority: 'high',
        data: {
          amount: debt.amount,
          description: debt.description,
          paidAt: debt.paidAt,
          paymentMethod: paymentMethod || 'not specified',
          debtId: debt._id.toString()
        },
        actionUrl: `/debts`
      });
      console.log('✅ Payment notification sent to creditor');
    } catch (notifError) {
      console.error('⚠️ Failed to create payment notification:', notifError.message);
    }

    console.log('✅ Debt marked as paid by debtor:', id);

    res.status(200).json({
      success: true,
      message: 'Payment recorded successfully',
      debt: updatedDebt
    });

  } catch (error) {
    console.error('❌ Error marking debt as paid:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to mark debt as paid',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// SEND PAYMENT REMINDER 🔥
// ============================
router.post('/:id/remind', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    console.log('🔔 Sending payment reminder for debt:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid debt ID format'
      });
    }

    const debt = await Debt.findById(id)
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId');

    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Debt not found'
      });
    }

    // Only creditor can send reminders
    if (debt.creditor._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the creditor can send payment reminders'
      });
    }

    if (debt.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot send reminder for non-pending debts'
      });
    }

    // Update last reminder sent timestamp
    if (!debt.metadata) {
      debt.metadata = {};
    }
    debt.metadata.lastReminderAt = new Date();
    debt.metadata.remindersSent = (debt.metadata.remindersSent || 0) + 1;
    await debt.save();

    // 🔔 CREATE NOTIFICATION FOR DEBTOR
    try {
      const customMessage = message || `Reminder: You owe ₹${debt.amount} for "${debt.description}"`;
      
      // Check if debt is overdue
      const isOverdue = debt.dueDate && new Date(debt.dueDate) < new Date();
      const priorityLevel = isOverdue ? 'high' : 'normal';
      
      await Notification.create({
        userId: debt.debtor._id,
        senderId: req.user._id,
        type: 'payment_reminder',
        title: isOverdue ? '⚠️ Overdue Payment Reminder' : '⏰ Payment Reminder',
        message: customMessage,
        relatedId: debt._id,
        relatedModel: 'Debt',
        read: false,
        priority: priorityLevel,
        data: {
          amount: debt.amount,
          description: debt.description,
          dueDate: debt.dueDate,
          debtId: debt._id.toString(),
          isOverdue: isOverdue,
          reminderCount: debt.metadata.remindersSent
        },
        actionUrl: `/debts`
      });
      console.log('✅ Payment reminder notification sent');
    } catch (notifError) {
      console.error('⚠️ Failed to create reminder notification:', notifError.message);
      // Return error since reminder notification is critical
      return res.status(500).json({
        success: false,
        message: 'Failed to send reminder notification'
      });
    }

    console.log('✅ Payment reminder sent for debt:', id);

    res.status(200).json({
      success: true,
      message: `Payment reminder sent to ${debt.debtor.name}`
    });

  } catch (error) {
    console.error('❌ Error sending payment reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send payment reminder',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// CANCEL DEBT
// ============================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid debt ID format'
      });
    }

    const debt = await Debt.findById(id)
      .populate('debtor', 'name email userId')
      .populate('creditor', 'name email userId');

    if (!debt) {
      return res.status(404).json({
        success: false,
        message: 'Debt not found'
      });
    }

    // Only creditor can cancel the debt
    if (debt.creditor._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the creditor can cancel this debt'
      });
    }

    debt.status = 'cancelled';
    await debt.save();

    // 🔔 CREATE NOTIFICATION FOR DEBTOR
    try {
      await Notification.create({
        userId: debt.debtor._id,
        senderId: req.user._id,
        type: 'debt_cancelled',
        title: '🚫 Debt Cancelled',
        message: `${req.user.name} cancelled the debt of ₹${debt.amount} for "${debt.description}"`,
        relatedId: debt._id,
        relatedModel: 'Debt',
        read: false,
        priority: 'normal',
        data: {
          amount: debt.amount,
          description: debt.description,
          debtId: debt._id.toString()
        },
        actionUrl: `/debts`
      });
      console.log('✅ Cancellation notification sent to debtor');
    } catch (notifError) {
      console.error('⚠️ Failed to create cancellation notification:', notifError);
    }

    console.log('✅ Debt cancelled:', id);

    res.status(200).json({
      success: true,
      message: 'Debt cancelled successfully'
    });

  } catch (error) {
    console.error('❌ Error cancelling debt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel debt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================
// GET DEBTS WITH A SPECIFIC FRIEND
// ============================
router.get('/friend/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID format'
      });
    }

    const debts = await Debt.find({
      $or: [
        { creditor: userId, debtor: friendId },
        { creditor: friendId, debtor: userId }
      ],
      status: { $ne: 'cancelled' }
    })
      .populate('creditor', 'name email userId')
      .populate('debtor', 'name email userId')
      .sort({ createdAt: -1 });

    const owedToMe = debts
      .filter(d => d.creditor._id.toString() === userId.toString() && d.status === 'pending')
      .reduce((sum, d) => sum + d.amount, 0);

    const owedByMe = debts
      .filter(d => d.debtor._id.toString() === userId.toString() && d.status === 'pending')
      .reduce((sum, d) => sum + d.amount, 0);

    res.status(200).json({
      success: true,
      debts,
      summary: {
        totalDebts: debts.length,
        owedToMe,
        owedByMe,
        netBalance: owedToMe - owedByMe
      }
    });

  } catch (error) {
    console.error('❌ Error fetching debts with friend:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debts with friend',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;