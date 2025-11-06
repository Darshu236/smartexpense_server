import Debt from '../models/Debt.js';
import mongoose from 'mongoose';

// Get debts where current user is the debtor
export const getDebtsOwedByMe = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 Fetching debts owed by user:', userId);
    
    const debts = await Debt.find({ debtor: userId }).populate('creditor', 'name email');
    
    console.log(`✅ Found ${debts.length} debts owed by user`);
    res.json({ success: true, data: debts });
  } catch (error) {
    console.error('❌ Error fetching debts owed by me:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch debts', error: error.message });
  }
};

// Get debts where current user is the creditor
export const getDebtsOwedToMe = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📋 Fetching debts owed to user:', userId);
    
    const debts = await Debt.find({ creditor: userId }).populate('debtor', 'name email');
    
    console.log(`✅ Found ${debts.length} debts owed to user`);
    res.json({ success: true, data: debts });
  } catch (error) {
    console.error('❌ Error fetching debts owed to me:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch debts', error: error.message });
  }
};

// Mark a debt as paid
export const markDebtAsPaid = async (req, res) => {
  try {
    const { debtId } = req.params;
    const { paymentMethod } = req.body;
    const userId = req.user.id;

    console.log('🔍 [MARK AS PAID] Request details:', {
      debtId,
      userId,
      paymentMethod
    });

    // Validate debtId
    if (!mongoose.Types.ObjectId.isValid(debtId)) {
      console.log('❌ Invalid debt ID format');
      return res.status(400).json({ success: false, message: 'Invalid debt ID format' });
    }

    // Find the debt
    const debt = await Debt.findById(debtId);
    
    if (!debt) {
      console.log('❌ Debt not found');
      return res.status(404).json({ success: false, message: 'Debt not found' });
    }

    console.log('📋 Found debt:', {
      _id: debt._id,
      creditor: debt.creditor,
      debtor: debt.debtor,
      currentStatus: debt.status,
      amount: debt.amount
    });

    // Check authorization
    if (debt.debtor.toString() !== userId.toString()) {
      console.log('❌ Authorization failed');
      return res.status(403).json({ 
        success: false, 
        message: 'You are not authorized to mark this debt as paid' 
      });
    }

    // Check if already paid
    if (debt.status === 'paid') {
      console.log('⚠️ Debt already paid');
      return res.status(400).json({ 
        success: false, 
        message: 'This debt is already marked as paid' 
      });
    }

    // CRITICAL FIX: Set status to 'paid' NOT 'settled'
    console.log('🔄 Updating debt status to: paid');
    debt.status = 'paid';  // Use 'paid' not 'settled'
    debt.paidAt = new Date();
    
    if (paymentMethod) {
      debt.paymentMethod = paymentMethod;
    }

    await debt.save();

    console.log('✅ Debt marked as paid successfully');

    res.json({ 
      success: true, 
      message: 'Debt marked as paid successfully', 
      data: debt 
    });

  } catch (error) {
    console.error('❌ Error marking debt as paid:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark debt as paid', 
      error: error.message 
    });
  }
};

// Create a manual debt
export const createManualDebt = async (req, res) => {
  try {
    const { debtorId, amount, description, dueDate } = req.body;
    const creditorId = req.user.id;

    console.log('🆕 Creating manual debt:', {
      creditorId,
      debtorId,
      amount,
      description
    });

    // Validate debtorId
    if (!mongoose.Types.ObjectId.isValid(debtorId)) {
      return res.status(400).json({ success: false, message: 'Invalid debtor ID' });
    }

    const debtData = {
      creditor: creditorId,
      debtor: debtorId,
      amount: parseFloat(amount),
      description,
      status: 'pending',  // Use 'pending' not 'active'
      type: 'manual'
    };

    if (dueDate) {
      debtData.dueDate = new Date(dueDate);
    }

    const debt = new Debt(debtData);
    await debt.save();
    await debt.populate('debtor', 'name email');

    console.log('✅ Manual debt created');

    res.status(201).json({ 
      success: true, 
      message: 'Debt created successfully', 
      data: debt 
    });
  } catch (error) {
    console.error('❌ Error creating manual debt:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create debt', 
      error: error.message 
    });
  }
};

// Delete a debt
export const deleteDebt = async (req, res) => {
  try {
    const { debtId } = req.params;
    const userId = req.user.id;

    console.log('🗑️ Delete debt request:', { debtId, userId });

    if (!mongoose.Types.ObjectId.isValid(debtId)) {
      return res.status(400).json({ success: false, message: 'Invalid debt ID' });
    }

    const debt = await Debt.findById(debtId);
    
    if (!debt) {
      return res.status(404).json({ success: false, message: 'Debt not found' });
    }

    if (debt.creditor.toString() !== userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creditor can delete a debt' 
      });
    }

    await Debt.deleteOne({ _id: debtId });
    console.log('✅ Debt deleted');

    res.json({ success: true, message: 'Debt deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting debt:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete debt', 
      error: error.message 
    });
  }
};

// Send payment reminder
export const sendPaymentReminder = async (req, res) => {
  try {
    const { debtId } = req.params;
    const userId = req.user.id;

    console.log('📬 Send reminder:', { debtId, userId });

    if (!mongoose.Types.ObjectId.isValid(debtId)) {
      return res.status(400).json({ success: false, message: 'Invalid debt ID' });
    }

    const debt = await Debt.findById(debtId).populate('debtor', 'name email');
    
    if (!debt) {
      return res.status(404).json({ success: false, message: 'Debt not found' });
    }

    if (debt.creditor.toString() !== userId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the creditor can send reminders' 
      });
    }

    if (debt.status === 'paid') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot send reminder for paid debt' 
      });
    }

    debt.lastReminderSent = new Date();
    await debt.save();

    console.log('✅ Reminder sent');

    res.json({ 
      success: true, 
      message: `Payment reminder sent to ${debt.debtor.name || debt.debtor.email}`,
      data: debt 
    });
  } catch (error) {
    console.error('❌ Error sending reminder:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send reminder', 
      error: error.message 
    });
  }
};