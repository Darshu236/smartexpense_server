// controllers/notificationController.js - Fixed to match your Notification model
import Notification from '../models/Notification.js';
import Debt from '../models/Debt.js';

/**
 * Get all notifications for the authenticated user
 */
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isRead } = req.query;
    const userId = req.user._id;

    // Build filter query
    const filter = { userId };
    
    if (type) {
      filter.type = type;
    }
    
    if (isRead !== undefined) {
      filter.isRead = isRead === 'true';
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('relatedId') // This might populate related expense/debt
      .lean();

    const total = await Notification.countDocuments(filter);

    res.status(200).json({
      success: true,
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalNotifications: total,
        hasMore: page * limit < total
      }
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get count of unread notifications
 */
export const getUnreadNotificationsCount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false
    });

    res.status(200).json({
      success: true,
      unreadCount
    });

  } catch (error) {
    console.error('Error fetching unread notifications count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread notifications count',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark a specific notification as read
 */
export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { 
        isRead: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or you do not have permission to access it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notification
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.updateMany(
      { userId, isRead: false },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete a specific notification
 */
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete all notifications for the user
 */
export const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, isRead } = req.query;

    // Build filter for deletion
    const filter = { userId };
    
    if (type) {
      filter.type = type;
    }
    
    if (isRead !== undefined) {
      filter.isRead = isRead === 'true';
    }

    const result = await Notification.deleteMany(filter);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} notifications`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a test notification (for development/testing)
 */
export const createTestNotification = async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Test notifications are not allowed in production'
      });
    }

    const userId = req.user._id;
    const { type = 'general', message = 'This is a test notification', priority = 'medium' } = req.body;

    const notification = new Notification({
      userId,
      type,
      message,
      priority,
      metadata: {
        testNotification: true,
        createdBy: 'system',
        timestamp: new Date().toISOString()
      }
    });

    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Test notification created successfully',
      notification
    });

  } catch (error) {
    console.error('Error creating test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get notification dashboard with stats and recent notifications
 */
export const getNotificationDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get notification statistics
    const [
      totalNotifications,
      unreadCount,
      recentNotifications,
      typeBreakdown
    ] = await Promise.all([
      Notification.countDocuments({ userId }),
      Notification.countDocuments({ userId, isRead: false }),
      Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Notification.aggregate([
        { $match: { userId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    // Get pending debts count for debt-related notifications
    const pendingDebtsCount = await Debt.countDocuments({
      $or: [
        { creditor: userId, status: 'pending' },
        { debtor: userId, status: 'pending' }
      ]
    });

    res.status(200).json({
      success: true,
      dashboard: {
        stats: {
          totalNotifications,
          unreadCount,
          readCount: totalNotifications - unreadCount,
          pendingDebtsCount
        },
        recentNotifications,
        typeBreakdown: typeBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching notification dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};