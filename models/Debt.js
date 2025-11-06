// models/Debt.js - Enhanced with split expense support

import mongoose from 'mongoose';

const debtSchema = new mongoose.Schema({
  // Creditor - person who is owed money
  creditor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Debtor - person who owes money
  debtor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Amount owed
  amount: {
    type: Number,
    required: true,
    min: 0.01,
    validate: {
      validator: function(value) {
        return value > 0;
      },
      message: 'Amount must be greater than 0'
    }
  },
  
  // Description of the debt
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  
  // Debt status
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled', 'disputed'],
    default: 'pending',
    index: true
  },
  
  // Type of debt
  type: {
    type: String,
    enum: ['manual', 'split', 'loan'],
    default: 'manual',
    index: true
  },
  
  // Related split expense (if applicable)
  relatedExpenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SplitExpense',
    default: null,
    index: true
  },
  
  // Due date (optional)
  dueDate: {
    type: Date,
    default: null
  },
  
  // When the debt was paid
  paidAt: {
    type: Date,
    default: null
  },
  
  // Payment method (optional)
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'credit_card', 'other'],
    default: null
  },
  
  // Additional metadata
  metadata: {
    splitExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'SplitExpense' },
    category: { type: String },
    originalAmount: { type: Number },
    splitType: { type: String },
    notes: { type: String },
    remindersSent: { type: Number, default: 0 },
    lastReminderAt: { type: Date }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
debtSchema.index({ creditor: 1, status: 1, createdAt: -1 });
debtSchema.index({ debtor: 1, status: 1, createdAt: -1 });
debtSchema.index({ creditor: 1, debtor: 1, status: 1 });
debtSchema.index({ relatedExpenseId: 1, status: 1 });
debtSchema.index({ type: 1, status: 1 });

// Virtual for checking if debt is overdue
debtSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status !== 'pending') {
    return false;
  }
  return new Date() > this.dueDate;
});

// Pre-save middleware to update timestamps
debtSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get all debts for a user (both owed to them and by them)
debtSchema.statics.getUserDebts = async function(userId) {
  const [owedToMe, owedByMe] = await Promise.all([
    this.find({ creditor: userId })
      .populate('debtor', 'name email userId')
      .sort({ createdAt: -1 })
      .lean(),
    this.find({ debtor: userId })
      .populate('creditor', 'name email userId')
      .sort({ createdAt: -1 })
      .lean()
  ]);
  
  return { owedToMe, owedByMe };
};

// Static method to calculate total balance between two users
debtSchema.statics.getBalanceBetweenUsers = async function(user1Id, user2Id) {
  const debts = await this.find({
    $or: [
      { creditor: user1Id, debtor: user2Id, status: 'pending' },
      { creditor: user2Id, debtor: user1Id, status: 'pending' }
    ]
  }).lean();
  
  let balance = 0;
  debts.forEach(debt => {
    if (debt.creditor.toString() === user1Id.toString()) {
      balance += debt.amount; // user1 is owed
    } else {
      balance -= debt.amount; // user1 owes
    }
  });
  
  return {
    balance,
    owedToUser1: balance > 0 ? balance : 0,
    owedByUser1: balance < 0 ? Math.abs(balance) : 0
  };
};

// Static method to get split expense debts
debtSchema.statics.getSplitExpenseDebts = async function(userId) {
  const debts = await this.find({
    $or: [
      { creditor: userId, type: 'split' },
      { debtor: userId, type: 'split' }
    ]
  })
  .populate('creditor', 'name email userId')
  .populate('debtor', 'name email userId')
  .populate('relatedExpenseId')
  .sort({ createdAt: -1 })
  .lean();
  
  return debts;
};

// Instance method to mark debt as paid
debtSchema.methods.markAsPaid = async function(paymentMethod = null) {
  this.status = 'paid';
  this.paidAt = new Date();
  if (paymentMethod) {
    this.paymentMethod = paymentMethod;
  }
  await this.save();
  return this;
};

// Instance method to send reminder
debtSchema.methods.recordReminderSent = async function() {
  if (!this.metadata) {
    this.metadata = {};
  }
  this.metadata.remindersSent = (this.metadata.remindersSent || 0) + 1;
  this.metadata.lastReminderAt = new Date();
  await this.save();
  return this;
};

const Debt = mongoose.model('Debt', debtSchema);

export default Debt;