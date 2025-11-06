// middleware/authMiddleware.js - FIXED VERSION
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import mongoose from 'mongoose';

const authMiddleware = async (req, res, next) => {
  console.log('🔐 Auth middleware started');
  
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid Authorization header found');
      return res.status(401).json({
        success: false,
        message: 'No token provided or invalid format'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      console.log('❌ No token found after Bearer');
      return res.status(401).json({
        success: false,
        message: 'Token is empty'
      });
    }

    // Get JWT secret
    const jwtSecret = process.env.JWT_SECRET || 'BftADbtb9sR0S1Iq1LpncSP1yiFRScR8I0uM+IiB6LA=';
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
      console.log('✅ Token decoded successfully:', { id: decoded.id, userId: decoded.userId, email: decoded.email });
    } catch (jwtError) {
      console.log('❌ JWT verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: jwtError.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'
      });
    }

    // Find user - try multiple lookup strategies
    let user = null;
    
    // Strategy 1: Try decoded.id as MongoDB ObjectId
    if (decoded.id) {
      try {
        if (mongoose.Types.ObjectId.isValid(decoded.id)) {
          user = await User.findById(decoded.id);
          if (user) {
            console.log('✅ User found by decoded.id (ObjectId):', user._id);
          }
        }
      } catch (error) {
        console.warn('⚠️ Error looking up by decoded.id as ObjectId:', error.message);
      }
    }
    
    // Strategy 2: If not found, try decoded.userId
    if (!user && decoded.userId) {
      try {
        if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
          user = await User.findById(decoded.userId);
          if (user) {
            console.log('✅ User found by decoded.userId (ObjectId):', user._id);
          }
        } else {
          // Try as custom field
          user = await User.findOne({ userId: decoded.userId });
          if (user) {
            console.log('✅ User found by decoded.userId (custom field):', user._id);
          }
        }
      } catch (error) {
        console.warn('⚠️ Error looking up by decoded.userId:', error.message);
      }
    }
    
    // Strategy 3: Try by email if available
    if (!user && decoded.email) {
      try {
        user = await User.findOne({ email: decoded.email });
        if (user) {
          console.log('✅ User found by decoded.email:', user._id);
        }
      } catch (error) {
        console.warn('⚠️ Error looking up by decoded.email:', error.message);
      }
    }
    
    // Strategy 4: If still not found, search by any field matching decoded.id
    if (!user && decoded.id) {
      try {
        user = await User.findOne({
          $or: [
            { _id: decoded.id },
            { userId: decoded.id },
            { email: decoded.id }
          ]
        });
        if (user) {
          console.log('✅ User found by flexible search:', user._id);
        }
      } catch (error) {
        console.warn('⚠️ Error in flexible user search:', error.message);
      }
    }
    
    if (!user) {
      console.log('❌ User not found with any strategy');
      console.log('🔍 Decoded token payload:', decoded);
      
      // Debug: Show available users (only in development)
      if (process.env.NODE_ENV === 'development') {
        try {
          const userCount = await User.countDocuments();
          console.log(`📊 Total users in database: ${userCount}`);
          
          if (userCount < 10) {
            const allUsers = await User.find({}, { _id: 1, email: 1, userId: 1, name: 1 });
            console.log('👥 Available users:', allUsers);
          }
        } catch (dbError) {
          console.error('❌ Error querying users for debug:', dbError);
        }
      }
      
      return res.status(401).json({
        success: false,
        message: 'User not found. Please log in again.'
      });
    }

    // Attach user info to request
    req.user = {
      id: user._id.toString(),
      _id: user._id,
      email: user.email,
      name: user.name,
      userId: user.userId
    };

    console.log('✅ Auth middleware completed successfully for user:', req.user.id);
    next();

  } catch (error) {
    console.error('💥 Auth middleware error:', error);
    
    if (error.name === 'MongooseError' || error.name === 'MongoError') {
      return res.status(500).json({
        success: false,
        message: 'Database error during authentication'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
};

export default authMiddleware;