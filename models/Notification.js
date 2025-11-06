// server/models/Notification.js - Notification MongoDB Schema
import mongoose from 'mongoose';
const notificationSchema = new mongoose.Schema({
  // User who receives the notification
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // User who triggered the notification
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Type of notification
  type: {
    type: String,
    enum: [
     'expense_created',
    'expense_updated',
    'expense_deleted',
    'payment_received',      
    'payment_reminder',      
    'debt_settled',          
    'debt_created',          
    'debt_cancelled',        
    'friend_request',
    'friend_accepted',
    'group_invite',
    'settlement_request',
    'comment_added',
    'mention'
    ],
    required: true,
    index: true
  },

  // Notification title
  title: {
    type: String,
    required: true,
    trim: true
  },

  // Notification message
  message: {
    type: String,
    required: true,
    trim: true
  },

  // Reference to related document (expense, group, etc.)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },

  // Model name for the related document
  relatedModel: {
    type: String,
    enum: ['SplitExpense', 'Group', 'User', 'Settlement', 'Comment']
  },

  // Additional data (flexible JSON for extra info)
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Read status
  read: {
    type: Boolean,
    default: false,
    index: true
  },

  // When the notification was read
  readAt: {
    type: Date
  },

  // Priority level
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },

  // Action URL (where to navigate when clicked)
  actionUrl: {
    type: String
  },

  // Expiration date (optional - for time-sensitive notifications)
  expiresAt: {
    type: Date
  },

  // Delivery channels
  channels: {
    inApp: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: false
    },
    sms: {
      type: Boolean,
      default: false
    }
  },

  // Delivery status
  delivered: {
    type: Boolean,
    default: true // In-app is always delivered immediately
  },

  deliveredAt: {
    type: Date,
    default: Date.now
  },

  // Email/Push notification status
  emailSent: {
    type: Boolean,
    default: false
  },

  pushSent: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true // Adds createdAt and updatedAt
});

// ============================
// INDEXES FOR PERFORMANCE
// ============================
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1 });
notificationSchema.index({ relatedId: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { 
  expireAfterSeconds: 0,
  partialFilterExpression: { expiresAt: { $exists: true } }
});

// ============================
// STATIC METHODS
// ============================

/**
 * Get unread count for a user
 */
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({ userId, read: false });
};

/**
 * Mark notifications as read for a specific related item
 */
notificationSchema.statics.markRelatedAsRead = async function(userId, relatedId) {
  return await this.updateMany(
    { userId, relatedId, read: false },
    { read: true, readAt: new Date() }
  );
};

/**
 * Delete old read notifications (cleanup)
 */
notificationSchema.statics.cleanupOldNotifications = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return await this.deleteMany({
    read: true,
    createdAt: { $lt: cutoffDate }
  });
};

/**
 * Get notification summary for a user
 */
notificationSchema.statics.getSummary = async function(userId) {
  const unread = await this.countDocuments({ userId, read: false });
  const total = await this.countDocuments({ userId });
  
  const byType = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), read: false } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ]);

  return {
    unread,
    total,
    byType: byType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {})
  };
};

/**
 * Create expense notification
 */
notificationSchema.statics.createExpenseNotification = async function(
  recipientIds,
  senderId,
  expenseData
) {
  const notifications = recipientIds.map(recipientId => ({
    userId: recipientId,
    senderId: senderId,
    type: 'expense_created',
    title: '💰 New Split Expense',
    message: `You've been added to "${expenseData.description}". Your share: ₹${expenseData.yourShare}`,
    relatedId: expenseData.expenseId,
    relatedModel: 'SplitExpense',
    data: {
      description: expenseData.description,
      amount: expenseData.yourShare,
      paidBy: expenseData.paidBy,
      totalAmount: expenseData.totalAmount
    },
    priority: 'normal',
    actionUrl: `/expenses/${expenseData.expenseId}`
  }));

  return await this.insertMany(notifications);
};

notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return await this.save();
};

/**
 * Check if notification is expired
 */
notificationSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

/**
 * Get formatted notification for display
 */
notificationSchema.methods.toDisplay = function() {
  return {
    id: this._id,
    title: this.title,
    message: this.message,
    type: this.type,
    read: this.read,
    createdAt: this.createdAt,
    sender: this.senderId ? {
      id: this.senderId._id,
      name: this.senderId.name,
      avatar: this.senderId.profilePicture
    } : null,
    actionUrl: this.actionUrl,
    priority: this.priority
  };
};


// Pre-save middleware to set default action URL
notificationSchema.pre('save', function(next) {
  if (!this.actionUrl && this.relatedId && this.relatedModel) {
    switch (this.relatedModel) {
      case 'SplitExpense':
        this.actionUrl = `/expenses/${this.relatedId}`;
        break;
      case 'Group':
        this.actionUrl = `/groups/${this.relatedId}`;
        break;
      case 'User':
        this.actionUrl = `/profile/${this.relatedId}`;
        break;
    }
  }
  next();
});


// Time since notification was created
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
});

// Ensure virtuals are included in JSON
notificationSchema.set('toJSON', { virtuals: true });
notificationSchema.set('toObject', { virtuals: true });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;