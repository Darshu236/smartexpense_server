// Add this test endpoint to your friendRoutes.js or create a separate test route

import User from '../models/User';
import mongoose from 'mongoose';

// Test endpoint - Add this to your routes
export const testEndpoint = async (req, res) => {
  console.log('=== TEST ENDPOINT HIT ===');
  
  try {
    console.log('👤 req.user:', JSON.stringify(req.user, null, 2));
    console.log('🗄️ Database connection status:', mongoose.connection.readyState);
    
    // Test database connection
    const userCount = await User.countDocuments();
    console.log('📊 Total users in database:', userCount);
    
    // Test finding current user
    const currentUserId = req.user?.id || req.user?._id;
    console.log('🔍 Trying to find current user with ID:', currentUserId);
    
    let currentUser = null;
    if (currentUserId) {
      try {
        currentUser = await User.findById(currentUserId);
        console.log('✅ Current user found:', currentUser ? 'Yes' : 'No');
        if (currentUser) {
          console.log('👤 User data:', {
            id: currentUser._id,
            name: currentUser.name,
            userId: currentUser.userId,
            friendsArray: Array.isArray(currentUser.friends),
            friendsCount: currentUser.friends ? currentUser.friends.length : 'undefined'
          });
        }
      } catch (findError) {
        console.log('❌ Error finding current user:', findError.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Test endpoint working',
      debug: {
        hasUser: !!req.user,
        userId: currentUserId,
        userFound: !!currentUser,
        dbConnection: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        totalUsers: userCount,
        currentUserData: currentUser ? {
          id: currentUser._id,
          name: currentUser.name,
          userId: currentUser.userId,
          hasFriendsField: 'friends' in currentUser,
          friendsIsArray: Array.isArray(currentUser.friends),
          friendsCount: currentUser.friends ? currentUser.friends.length : 0
        } : null
      }
    });
    
  } catch (error) {
    console.error('💥 Test endpoint error:', error);
    res.status(500).json({
      error: 'Test endpoint failed',
      details: error.message,
      stack: error.stack
    });
  }
};

