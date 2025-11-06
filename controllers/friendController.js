// controllers/friendController.js - COMPLETE FIXED VERSION
import User from '../models/User.js';
import Friend from '../models/Friend.js';
import mongoose from 'mongoose';

// Get all friends - FIXED to return Friend documents
export const getAllFriends = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    console.log('Getting friends for user:', currentUserId);

    // Get Friend documents instead of User.friends array
    const friendDocs = await Friend.find({ 
      user: currentUserId,
      status: 'active'
    })
    .populate('friendUser', 'name email userId')
    .lean();

    console.log(`Found ${friendDocs.length} Friend documents`);

    // Map to the format expected by frontend
    const friends = friendDocs.map(friendDoc => ({
      _id: friendDoc._id,
      name: friendDoc.name || friendDoc.friendUser?.name,
      email: friendDoc.email || friendDoc.friendUser?.email,
      userId: friendDoc.friendUser?.userId,
      friendUserId: friendDoc.friendUser?._id,
      status: friendDoc.status
    }));

    console.log(`Returning ${friends.length} friends with Friend document IDs`);

    res.json({
      success: true,
      friends: friends,
      count: friends.length
    });

  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch friends',
      error: error.message
    });
  }
};

// Search users
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user._id;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        users: [],
        count: 0,
        message: 'Query too short'
      });
    }

    console.log('Searching for:', q);

    const searchQuery = q.trim();
    const searchRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { userId: searchRegex }
      ]
    })
    .select('name email userId')
    .limit(20);

    console.log(`Found ${users.length} users`);

    res.json({
      success: true,
      users: users,
      count: users.length
    });

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
};

// Add friend - FIXED with aggressive cleanup
export const addFriend = async (req, res) => {
  try {
    const { userId: friendUserId } = req.body;
    const currentUserId = req.user._id;

    console.log('Adding friend:', { currentUserId, friendUserId });

    if (!friendUserId) {
      return res.status(400).json({
        success: false,
        message: 'Friend userId is required'
      });
    }

    if (friendUserId === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add yourself as a friend'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(friendUserId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID'
      });
    }

    // CRITICAL FIX: Delete ALL corrupted Friend documents globally
    const deleteResult = await Friend.deleteMany({
      $or: [
        { friendUser: null },
        { friendUser: { $exists: false } },
        { user: null },
        { user: { $exists: false } }
      ]
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`🗑️ Cleaned up ${deleteResult.deletedCount} corrupted Friend documents globally`);
    }

    // Find both users
    const [currentUser, friendUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(friendUserId)
    ]);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'Current user not found'
      });
    }

    if (!friendUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if valid Friend document already exists
    const existingFriend = await Friend.findOne({
      user: currentUserId,
      friendUser: friendUserId
    });

    if (existingFriend) {
      return res.status(409).json({
        success: false,
        message: `${friendUser.name} is already your friend`
      });
    }

    // Create Friend document with all required fields
    const newFriendDoc = new Friend({
      user: currentUserId,
      friendUser: friendUserId,
      name: friendUser.name,
      email: friendUser.email,
      userId: friendUser.userId,
      status: 'active'
    });

    await newFriendDoc.save();

    // Also add to User.friends array for backward compatibility
    if (!currentUser.friends) {
      currentUser.friends = [];
    }
    if (!currentUser.friends.includes(friendUserId)) {
      currentUser.friends.push(friendUserId);
      await currentUser.save();
    }

    // Reciprocal friend
    if (!friendUser.friends) {
      friendUser.friends = [];
    }
    if (!friendUser.friends.includes(currentUserId)) {
      friendUser.friends.push(currentUserId);
      await friendUser.save();
    }

    console.log('✅ Friend added successfully');

    res.json({
      success: true,
      message: `${friendUser.name} added as friend`,
      friend: {
        _id: newFriendDoc._id,
        name: friendUser.name,
        email: friendUser.email,
        userId: friendUser.userId,
        friendUserId: friendUser._id
      }
    });

  } catch (error) {
    console.error('Error adding friend:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This friend already exists in your list'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to add friend',
      error: error.message
    });
  }
};

// Remove friend
export const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;
    const currentUserId = req.user._id;

    console.log('Removing friend:', { currentUserId, friendId });

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID'
      });
    }

    // Try to find Friend document by _id first
    let friendDoc = await Friend.findOne({
      _id: friendId,
      user: currentUserId
    });

    // If not found, try finding by friendUser
    if (!friendDoc) {
      friendDoc = await Friend.findOne({
        user: currentUserId,
        friendUser: friendId
      });
    }

    if (!friendDoc) {
      return res.status(404).json({
        success: false,
        message: 'Friend not found'
      });
    }

    const friendUserId = friendDoc.friendUser;

    // Delete Friend document
    await Friend.deleteOne({ _id: friendDoc._id });

    // Also remove from User.friends arrays
    await Promise.all([
      User.findByIdAndUpdate(currentUserId, {
        $pull: { friends: friendUserId }
      }),
      User.findByIdAndUpdate(friendUserId, {
        $pull: { friends: currentUserId }
      })
    ]);

    console.log('Friend removed successfully');

    res.json({
      success: true,
      message: 'Friend removed successfully'
    });

  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove friend',
      error: error.message
    });
  }
};

// Get specific friend by ID
export const getFriendById = async (req, res) => {
  try {
    const { friendId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID'
      });
    }

    // Try to find Friend document
    const friendDoc = await Friend.findOne({
      _id: friendId,
      user: currentUserId
    }).populate('friendUser', 'name email userId');

    if (!friendDoc) {
      return res.status(404).json({
        success: false,
        message: 'Friend not found'
      });
    }

    res.json({
      success: true,
      friend: {
        _id: friendDoc._id,
        name: friendDoc.name || friendDoc.friendUser?.name,
        email: friendDoc.email || friendDoc.friendUser?.email,
        userId: friendDoc.friendUser?.userId,
        friendUserId: friendDoc.friendUser?._id
      }
    });

  } catch (error) {
    console.error('Error getting friend by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get friend details',
      error: error.message
    });
  }
};

export default {
  getAllFriends,
  searchUsers,
  addFriend,
  removeFriend,
  getFriendById
};