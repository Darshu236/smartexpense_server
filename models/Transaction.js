// Backend: models/Transaction.js or wherever your schema is defined
import mongoose from 'mongoose';
// Define separate category arrays
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

const transactionSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [1, 'Description cannot be empty']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be positive']
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: ['income', 'expense'],
      message: 'Type must be either income or expense'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ALL_CATEGORIES,
      message: `Category must be one of: ${ALL_CATEGORIES.join(', ')}`
    }
  },
  paymentMode: {
    type: String,
    required: [true, 'Payment mode is required'],
    enum: {
      values: ['wallet', 'cash', 'card', 'bank'],
      message: 'Payment mode must be one of: wallet, cash, card, bank'
    }
  },
  date: {
    type: Date,
    default: Date.now
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Optional: Add custom validation to ensure category matches transaction type
transactionSchema.pre('save', function(next) {
  if (this.type === 'expense' && !EXPENSE_CATEGORIES.includes(this.category)) {
    return next(new Error(`Category "${this.category}" is not valid for expense transactions. Valid expense categories: ${EXPENSE_CATEGORIES.join(', ')}`));
  }
  
  if (this.type === 'income' && !INCOME_CATEGORIES.includes(this.category)) {
    return next(new Error(`Category "${this.category}" is not valid for income transactions. Valid income categories: ${INCOME_CATEGORIES.join(', ')}`));
  }
  
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction; 
