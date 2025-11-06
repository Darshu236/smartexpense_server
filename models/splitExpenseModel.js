// models/splitExpenseModel.js
import mongoose from 'mongoose';

const splitSchema = new mongoose.Schema({
  friendId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const splitExpenseSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    splits: {
      type: [splitSchema],
      validate: {
        validator: function (arr) {
          return arr && arr.length > 0;
        },
        message: 'At least one split required'
      }
    }
  },
  { timestamps: true }
);

export default mongoose.model('SplitExpense', splitExpenseSchema);



