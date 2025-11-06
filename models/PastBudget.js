import mongoose from 'mongoose';

const pastBudgetSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    ref: 'User', 
    required: true 
  },
  category: { 
    type: String, 
    required: true,
    trim: true
  },
  amount: { 
    type: Number, 
    required: true,
    min: [0.01, 'Amount must be positive']
  },
  type: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: 'monthly' 
  },
  startDate: { 
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  }
}, { timestamps: true });

// Index for better query performance
pastBudgetSchema.index({ userId: 1, endDate: -1 });

export default mongoose.model('PastBudget', pastBudgetSchema);