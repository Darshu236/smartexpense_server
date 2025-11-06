// models/Friend.js - Create proper Friend model to match your split expense expectations
import mongoose from 'mongoose';

const friendSchema = new mongoose.Schema({
  // The user who owns this friend relationship
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // The actual friend (reference to another user)
  friendUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Denormalized friend data for performance
  name: {
    type: String,
    required: true
  },
  
  email: {
    type: String,
    required: true
  },
  
  userId: {
    type: String,
    required: true
  },
  
  // Friend relationship status
  status: {
    type: String,
    enum: ['active', 'blocked', 'pending'],
    default: 'active'
  },
  
  // When friendship was established
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Last interaction or update
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Ensure unique friendships
friendSchema.index({ user: 1, friendUser: 1 }, { unique: true });
friendSchema.index({ user: 1, status: 1 });

// Update timestamp on save
friendSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual to get friend details
friendSchema.virtual('friend', {
  ref: 'User',
  localField: 'friendUser',
  foreignField: '_id',
  justOne: true
});

export default mongoose.model('Friend', friendSchema);