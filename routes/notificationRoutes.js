// routes/notificationRoutes.js - Fixed version with proper error handling

import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';

const router = express.Router();

// ============================
// SEND NOTIFICATION
// ============================
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { expenseId, recipientIds, type, data } = req.body;
    const senderId = req.user._id || req.user.userId;

    console.log('📧 Sending notifications:', {
      expenseId,
      recipientIds,
      type,
      senderId: senderId.toString()
    });

    // Validation
    if (!expenseId) {
      return res.status(400).json({
        success: false,
        message: 'Expense ID is required'
      });
    }

    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Recipient IDs are required'
      });
    }

    // Get sender info
    const sender = await User.findById(senderId).select('name email');
    if (!sender) {
      console.error('❌ Sender not found:', senderId);
      return res.status(404).json({
        success: false,
        message: 'Sender not found'
      });
    }

    console.log('✅ Sender found:', sender.name);

    // Create notification message based on type
    let message = '';
    let title = '';
    
    switch (type) {
      case 'expense_created':
        title = '💰 New Split Expense';
        const amount = data.yourShare || data.amount || '0';
        message = `${sender.name} added you to "${data.description}". Your share: ₹${amount}`;
        break;
      case 'expense_updated':
        title = '📝 Expense Updated';
        message = `${sender.name} updated the expense "${data.description}"`;
        break;
      case 'expense_deleted':
        title = '🗑️ Expense Deleted';
        message = `${sender.name} deleted the expense "${data.description}"`;
        break;
      case 'payment_received':
        title = '✅ Payment Received';
        message = `${sender.name} paid you ₹${data.amount} for "${data.description}"`;
        break;
      case 'payment_reminder':
        title = '⏰ Payment Reminder';
        message = `Reminder: You owe ${sender.name} ₹${data.amount} for "${data.description}"`;
        break;
      default:
        title = '🔔 Notification';
        message = `${sender.name} sent you a notification`;
    }

    console.log('📝 Notification content:', { title, message });

    // Create notifications for all recipients
    const notifications = [];
    const createdNotifications = [];
    const skippedRecipients = [];

    for (const recipientId of recipientIds) {
      // Skip if trying to notify self
      if (recipientId.toString() === senderId.toString()) {
        console.log('⏭️ Skipping self-notification for:', recipientId);
        skippedRecipients.push({ id: recipientId, reason: 'self' });
        continue;
      }

      // Verify recipient exists
      try {
        const recipientExists = await User.findById(recipientId).select('_id');
        if (!recipientExists) {
          console.warn('⚠️ Recipient not found:', recipientId);
          skippedRecipients.push({ id: recipientId, reason: 'not_found' });
          continue;
        }
      } catch (err) {
        console.error('❌ Error checking recipient:', recipientId, err);
        skippedRecipients.push({ id: recipientId, reason: 'error' });
        continue;
      }

      const notificationData = {
        userId: recipientId,
        senderId: senderId,
        type: type || 'expense_created',
        title: title,
        message: message,
        relatedId: expenseId,
        relatedModel: 'SplitExpense',
        data: data || {},
        read: false,
        createdAt: new Date()
      };

      notifications.push(notificationData);
    }

    console.log(`📊 Notifications to create: ${notifications.length}, Skipped: ${skippedRecipients.length}`);

    // Bulk insert notifications
    if (notifications.length > 0) {
      try {
        const result = await Notification.insertMany(notifications, { ordered: false });
        createdNotifications.push(...result);
        console.log(`✅ Created ${result.length} notifications successfully`);
      } catch (insertError) {
        console.error('❌ Error inserting notifications:', insertError);
        
        // Handle partial success with insertMany
        if (insertError.insertedDocs && insertError.insertedDocs.length > 0) {
          createdNotifications.push(...insertError.insertedDocs);
          console.log(`⚠️ Partial success: ${insertError.insertedDocs.length} notifications created`);
        } else {
          throw insertError;
        }
      }
    }

    // Return success even if some recipients were skipped
    res.status(201).json({
      success: true,
      message: 'Notifications processed',
      count: createdNotifications.length,
      skipped: skippedRecipients.length,
      notifications: createdNotifications,
      skippedRecipients: skippedRecipients
    });

  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ============================
// GET USER'S NOTIFICATIONS
// ============================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;
    const { unreadOnly, type, limit = 50, skip = 0 } = req.query;

    console.log('📬 Fetching notifications for user:', userId);

    // Build query
    const query = { userId };
    
    if (unreadOnly === 'true') {
      query.read = false;
    }
    
    if (type) {
      query.type = type;
    }

    // Fetch notifications
    const notifications = await Notification.find(query)
      .populate('senderId', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId, 
      read: false 
    });

    console.log(`✅ Found ${notifications.length} notifications (${unreadCount} unread)`);

    res.json({
      success: true,
      notifications,
      total,
      unreadCount,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

// ============================
// MARK NOTIFICATION AS READ
// ============================
router.put('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id || req.user.userId;

    console.log('✔ Marking notification as read:', notificationId);

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    console.log('✅ Notification marked as read');

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    });

  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
});

// ============================
// MARK ALL NOTIFICATIONS AS READ
// ============================
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;

    console.log('✔ Marking all notifications as read for user:', userId);

    const result = await Notification.updateMany(
      { userId, read: false },
      { read: true, readAt: new Date() }
    );

    console.log(`✅ Marked ${result.modifiedCount} notifications as read`);

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      count: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    });
  }
});

// ============================
// DELETE NOTIFICATION
// ============================
router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id || req.user.userId;

    console.log('🗑️ Deleting notification:', notificationId);

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    console.log('✅ Notification deleted');

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: error.message
    });
  }
});

// ============================
// GET UNREAD COUNT
// ============================
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;

    const count = await Notification.countDocuments({
      userId,
      read: false
    });

    res.json({
      success: true,
      count
    });

  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
});

// ============================
// DELETE ALL READ NOTIFICATIONS
// ============================
router.delete('/clear/read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id || req.user.userId;

    console.log('🗑️ Clearing all read notifications for user:', userId);

    const result = await Notification.deleteMany({
      userId,
      read: true
    });

    console.log(`✅ Deleted ${result.deletedCount} read notifications`);

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} read notifications`,
      count: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error clearing read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear read notifications',
      error: error.message
    });
  }
});

export default router;