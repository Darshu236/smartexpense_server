// routes/groupRoutes.js - Group Management Routes
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Group from '../models/Group.js';

const router = express.Router();

// Enhanced auth middleware (reuse from friendRoutes.js)
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ Auth failed: No token provided');
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        authError: true 
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    console.log('🔍 JWT Decoded:', {
      userId: decoded.userId,
      id: decoded.id,
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name
    });
    
    // Try different user ID fields from JWT
    let userIdentifier = decoded.userId || decoded.id || decoded.sub;
    let foundUser = null;
    
    if (!userIdentifier) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: no user identifier',
        authError: true
      });
    }
    
    // Try to find user by different methods
    try {
      // First try as MongoDB ObjectId if it looks like one
      if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
        foundUser = await User.findById(userIdentifier).select('_id name email userId');
      }
      
      // If not found, try by userId field (custom user ID)
      if (!foundUser) {
        foundUser = await User.findOne({ userId: userIdentifier }).select('_id name email userId');
      }
      
      // If still not found, try by email
      if (!foundUser && decoded.email) {
        foundUser = await User.findOne({ email: decoded.email }).select('_id name email userId');
      }
      
    } catch (dbError) {
      console.error('🔍 Database lookup error:', dbError);
    }
    
    if (!foundUser) {
      console.log('❌ User not found with identifier:', userIdentifier);
      return res.status(401).json({
        success: false,
        message: 'User not found',
        authError: true
      });
    }
    
    // Set user data for subsequent middleware
    req.user = {
      _id: foundUser._id.toString(),
      userId: foundUser.userId || foundUser._id.toString(),
      email: foundUser.email,
      name: foundUser.name,
      dbUser: foundUser
    };
    
    console.log('✅ Auth successful for user:', {
      _id: req.user._id,
      userId: req.user.userId,
      email: req.user.email
    });
    
    next();
    
  } catch (error) {
    console.log('❌ Auth failed:', error.message);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token',
        authError: true 
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Authentication error',
        authError: true
      });
    }
  }
};

// Database connection middleware
const ensureDbConnection = (req, res, next) => {
  console.log('🔍 DB Connection State:', mongoose.connection.readyState);
  
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Database not connected');
    return res.status(503).json({
      success: false,
      message: 'Database connection not available'
    });
  }
  next();
};

// Apply middleware to all routes
router.use(ensureDbConnection);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    system: 'groups',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Get user's groups
router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching groups for user:', req.user._id);
    
    const groups = await Group.find({ 
      $or: [
        { createdBy: req.user._id },
        { members: req.user._id }
      ]
    })
    .populate('members', 'name email userId')
    .populate('createdBy', 'name email userId')
    .sort({ createdAt: -1 })
    .lean();
    
    console.log('✅ Found groups:', groups.length);
    
    res.json({ 
      success: true, 
      groups, 
      count: groups.length 
    });
    
  } catch (error) {
    console.error('💥 Error fetching groups:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch groups',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new group
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, members } = req.body;
    console.log('➕ Creating group:', name, 'with members:', members);
    
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group name is required' 
      });
    }
    
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one member is required' 
      });
    }
    
    // Validate all member IDs
    const validMemberIds = [];
    for (const memberId of members) {
      if (mongoose.Types.ObjectId.isValid(memberId)) {
        const memberExists = await User.findById(memberId).select('_id');
        if (memberExists) {
          validMemberIds.push(memberId);
        }
      }
    }
    
    if (validMemberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid members found'
      });
    }
    
    // Add current user to members if not included
    if (!validMemberIds.includes(req.user._id)) {
      validMemberIds.push(req.user._id);
    }
    
    const newGroup = new Group({
      name: name.trim(),
      members: validMemberIds,
      createdBy: req.user._id
    });
    
    await newGroup.save();
    
    // Populate the saved group
    const populatedGroup = await Group.findById(newGroup._id)
      .populate('members', 'name email userId')
      .populate('createdBy', 'name email userId')
      .lean();
    
    console.log('✅ Group created successfully');
    
    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group: populatedGroup
    });
    
  } catch (error) {
    console.error('💥 Create group error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create group',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete group
router.delete('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    console.log('🗑️ Deleting group:', groupId);
    
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }
    
    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Check if user is the creator or a member
    const isCreator = group.createdBy.toString() === req.user._id;
    const isMember = group.members.some(memberId => memberId.toString() === req.user._id);
    
    if (!isCreator && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this group'
      });
    }
    
    await Group.findByIdAndDelete(groupId);
    
    console.log('✅ Group deleted successfully');
    
    res.json({
      success: true,
      message: 'Group deleted successfully'
    });
    
  } catch (error) {
    console.error('💥 Delete group error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete group',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get group details
router.get('/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    console.log('🔍 Getting group details:', groupId);
    
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group ID format'
      });
    }
    
    const group = await Group.findById(groupId)
      .populate('members', 'name email userId profilePicture')
      .populate('createdBy', 'name email userId')
      .lean();
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Check if user is a member
    const isMember = group.members.some(member => member._id.toString() === req.user._id) || 
                     group.createdBy._id.toString() === req.user._id;
    
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this group'
      });
    }
    
    console.log('✅ Group details retrieved');
    
    res.json({
      success: true,
      group
    });
    
  } catch (error) {
    console.error('💥 Group details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get group details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;