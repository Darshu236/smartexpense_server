import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  name: { 
    type: String, 
    default: '' 
  },
  email: { 
    type: String, 
    default: '' 
  },
  currency: { 
    type: String, 
    default: "INR",
    enum: ['INR', 'USD', 'EUR', 'GBP']
  },
  theme: { 
    type: String, 
    default: "light",
    enum: ['light', 'dark', 'auto']
  },
  budgetLimit: { 
    type: Number, 
    default: 50000,
    min: 0
  },
  lowBalanceAlert: {
    type: Boolean,
    default: true
  },
  lowBalanceThreshold: {
    type: Number,
    default: 5000,
    min: 0
  }
}, {
  timestamps: true // This adds createdAt and updatedAt fields automatically
});

// Add an index on userId for faster queries
settingsSchema.index({ userId: 1 });

export default mongoose.model("Settings", settingsSchema);