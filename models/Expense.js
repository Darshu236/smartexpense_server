import mongoose from 'mongoose';

const splitSchema = new mongoose.Schema({
  friendId: {
    type: String,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, 'Split amount must be greater than 0']
  },
});

const expenseSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      ref: 'User',
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0.01, 'Total amount must be greater than 0']
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    splits: [splitSchema],
  },
  { timestamps: true }
);

// Validate that splits sum up to totalAmount
expenseSchema.pre('save', function(next) {
  if (this.splits && this.splits.length > 0) {
    const splitSum = this.splits.reduce((sum, split) => sum + split.amount, 0);
    if (Math.abs(splitSum - this.totalAmount) > 0.01) {
      return next(new Error('Split amounts must sum up to total amount'));
    }
  }
  next();
});

// Index for better query performance
expenseSchema.index({ user: 1, date: -1 });
expenseSchema.index({ user: 1, category: 1 });

export default mongoose.model('Expense', expenseSchema);