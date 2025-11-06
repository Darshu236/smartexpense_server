// controllers/unifiedFriendController.js - Works with both User.friends and Friend model
import User from '../models/User.js';
import Friend from '../models/Friend.js';
import mongoose from 'mongoose';

/**
 * Sync friends between User.friends array and Friend collection
 * This ensures compatibility between your existing system and split expenses
 */
const syncFriendData = async (userId, friendUserId, action = 'add') => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const friendObjectId = new mongoose.Types.ObjectId(friendUserId);

    if (action === 'add') {
      // Get friend user details
      const friendUser = await User.findById(friendObjectId);
      if (!friendUser) {
        throw new Error('Friend user not found');
      }

      // Create Friend record (for split expense compatibility)
      await Friend.findOneAndUpdate(
        { user: userObjectId, friendUser: friendObjectId },
        {
          user: userObjectId,
          friendUser: friendObjectId,
          name: friendUser.name,
          email: friendUser.email,
          userId: friendUser.userId || friendUser._id.toString(),
          status: 'active'
        },
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true
        }
      );

      // Update User.friends array (for existing system)
      await User.findByIdAndUpdate(userObjectId, {
        $addToSet: { friends: friendObjectId }
      });

      console.log(`Friend sync completed: ${userId} -> ${friendUserId}`);

    } else if (action === 'remove') {
      // Remove Friend record
      await Friend.deleteOne({ user: userObjectId, friendUser: friendObjectId });

      // Remove from User.friends array
      await User.findByIdAndUpdate(userObjectId, {
        $pull: { friends: friendObjectId }
      });

      console.log(`Friend removal sync completed: ${userId} -> ${friendUserId}`);
    }

    return true;
  } catch (error) {
    console.error('Friend sync error:', error);
    return false;
  }
};

/**
 * Get all friends for a user (compatible with both systems)
 */
export const getFriends = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log('Fetching friends for user:', userId);

    // Try to get friends from Friend collection first (for split expense compatibility)
    let friends = await Friend.find({ 
      user: userId, 
      status: 'active' 
    })
    .select('friendUser name email userId status createdAt')
    .lean();

    // If no Friend records exist, migrate from User.friends array
    if (friends.length === 0) {
      console.log('No Friend records found, checking User.friends array...');
      
      const user = await User.findById(userId)
        .populate('friends', 'name email userId')
        .select('friends');

      if (user && user.friends && user.friends.length > 0) {
        console.log(`Migrating ${user.friends.length} friends to Friend collection...`);
        
        // Create Friend records for existing relationships
        const friendPromises = user.friends.map(async (friend) => {
          const friendRecord = {
            user: userId,
            friendUser: friend._id,
            name: friend.name,
            email: friend.email,
            userId: friend.userId || friend._id.toString(),
            status: 'active'
          };

          await Friend.findOneAndUpdate(
            { user: userId, friendUser: friend._id },
            friendRecord,
            { upsert: true, new: true }
          );

          return {
            _id: friend._id,
            friendUser: friend._id,
            name: friend.name,
            email: friend.email,
            userId: friend.userId || friend._id.toString(),
            status: 'active'
          };
        });

        friends = await Promise.all(friendPromises);
        console.log('Migration completed successfully');
      }
    }

    // Format response for frontend compatibility
    const formattedFriends = friends.map(friend => ({
      _id: friend.friendUser || friend._id,
      name: friend.name,
      email: friend.email,
      userId: friend.userId,
      status: friend.status || 'active'
    }));

    res.json({
      success: true,
      friends: formattedFriends,
      count: formattedFriends.length
    });

  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch friends',
      friends: []
    });
  }
};

/**
 * Search for users to add as friends
 */
export const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user._id;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        users: [],
        count: 0,
        message: 'Query too short'
      });
    }

    // Get current friends to exclude from search
    const currentFriends = await Friend.find({ user: userId, status: 'active' })
      .select('friendUser')
      .lean();
    
    const friendIds = currentFriends.map(f => f.friendUser);

    // Search for users
    const searchQuery = q.trim();
    const searchRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const users = await User.find({
      _id: { 
        $ne: new mongoose.Types.ObjectId(userId),
        $nin: friendIds 
      },
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { userId: searchRegex }
      ]
    })
    .select('name email userId')
    .limit(20)
    .lean();

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
      users: []
    });
  }
};

/**
 * Add a friend (compatible with both systems)
 */
export const addFriend = async (req, res) => {
  try {
    const { userId: friendUserId } = req.body;
    const currentUserId = req.user._id;

    console.log('Adding friend:', { currentUserId, friendUserId });

    // Validation
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

    // Find friend user by _id (assuming friendUserId is the MongoDB _id)
    let friendUser = await User.findById(friendUserId);

    if (!friendUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already friends
    const existingFriend = await Friend.findOne({
      user: currentUserId,
      friendUser: friendUserId,
      status: 'active'
    });

    if (existingFriend) {
      return res.status(409).json({
        success: false,
        message: `${friendUser.name} is already your friend`
      });
    }

    // Add friendship in both directions with sync
    await Promise.all([
      syncFriendData(currentUserId, friendUserId, 'add'),
      syncFriendData(friendUserId, currentUserId, 'add')
    ]);

    res.json({
      success: true,
      message: `${friendUser.name} added as friend`,
      friend: {
        _id: friendUser._id,
        name: friendUser.name,
        email: friendUser.email,
        userId: friendUser.userId || friendUser._id.toString()
      }
    });

  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add friend'
    });
  }
};

/**
 * Remove a friend (compatible with both systems)
 */
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

    // Check if friendship exists
    const friendship = await Friend.findOne({
      user: currentUserId,
      friendUser: friendId,
      status: 'active'
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend not found in your list'
      });
    }

    // Remove friendship in both directions
    await Promise.all([
      syncFriendData(currentUserId, friendId, 'remove'),
      syncFriendData(friendId, currentUserId, 'remove')
    ]);

    const friendUser = await User.findById(friendId).select('name');
    
    res.json({
      success: true,
      message: `${friendUser?.name || 'Friend'} removed from friends`
    });

  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove friend'
    });
  }
};

/**
 * Get a specific friend by ID (for split expense validation)
 */
export const getFriendById = async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID format'
      });
    }

    // Check if this person is actually a friend
    const friendship = await Friend.findOne({
      user: userId,
      friendUser: friendId,
      status: 'active'
    }).populate('friendUser', 'name email userId');

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend not found or not accessible'
      });
    }

    const friendData = friendship.friendUser || await User.findById(friendId).select('name email userId');

    res.json({
      success: true,
      friend: {
        _id: friendId,
        name: friendData.name,
        email: friendData.email,
        userId: friendData.userId || friendId
      }
    });

  } catch (error) {
    console.error('Error getting friend by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get friend details'
    });
  }
};

/**
 * Migration utility to sync existing User.friends to Friend collection
 */
export const migrateFriendsToNewSystem = async (req, res) => {
  try {
    console.log('Starting friend migration...');

    const users = await User.find({ friends: { $exists: true, $ne: [] } })
      .populate('friends', 'name email userId');

    let migrationCount = 0;

    for (const user of users) {
      if (user.friends && user.friends.length > 0) {
        for (const friend of user.friends) {
          try {
            await Friend.findOneAndUpdate(
              { user: user._id, friendUser: friend._id },
              {
                user: user._id,
                friendUser: friend._id,
                name: friend.name,
                email: friend.email,
                userId: friend.userId || friend._id.toString(),
                status: 'active'
              },
              { upsert: true, new: true }
            );
            migrationCount++;
          } catch (err) {
            console.warn(`Failed to migrate friendship ${user._id} -> ${friend._id}:`, err.message);
          }
        }
      }
    }

    console.log(`Migration completed: ${migrationCount} friendships migrated`);

    res.json({
      success: true,
      message: `Successfully migrated ${migrationCount} friendships`,
      migrationCount
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      message: 'Migration failed'
    });
  }
};

export default {
  getFriends,
  searchUsers,
  addFriend,
  removeFriend,
  getFriendById,
  migrateFriendsToNewSystem
};