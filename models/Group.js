// models/Group.js
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
groupSchema.index({ createdBy: 1 });
groupSchema.index({ members: 1 });
groupSchema.index({ createdAt: -1 });

// Method to check if user is a member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(memberId => memberId.toString() === userId.toString()) ||
         this.createdBy.toString() === userId.toString();
};

export default mongoose.model('Group', groupSchema);