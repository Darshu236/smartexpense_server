import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        userId: user.userId,
        profilePicture: user.profilePicture,
        preferences: user.getPreferences(),
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        accountStatus: user.accountStatus
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: error.message
    });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;

    const user = await User.findOne({ userId: req.user.userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update basic info
    if (name && name.trim()) {
      user.name = name.trim();
    }
    
    if (email && email !== user.email) {
      // Check if email already exists
      const emailExists = await User.findOne({ 
        email: email.toLowerCase().trim(), 
        userId: { $ne: user.userId } 
      });
      
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Email already in use'
        });
      }
      
      user.email = email.toLowerCase().trim();
      user.isEmailVerified = false; // Reset email verification
    }

    // Update password if provided
    if (newPassword && currentPassword) {
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters long'
        });
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        userId: user.userId,
        profilePicture: user.profilePicture,
        preferences: user.getPreferences(),
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// @desc    Upload profile picture
// @route   POST /api/users/profile/picture
// @access  Private
export const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const user = await User.findOne({ userId: req.user.userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old profile picture if exists
    if (user.profilePicture) {
      const oldPicturePath = path.join('uploads', 'profiles', path.basename(user.profilePicture));
      if (fs.existsSync(oldPicturePath)) {
        fs.unlinkSync(oldPicturePath);
      }
    }

    // Update user with new profile picture
    user.profilePicture = `/uploads/profiles/${req.file.filename}`;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: {
        profilePicture: user.profilePicture
      }
    });

  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture',
      error: error.message
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required for account deletion'
      });
    }

    const user = await User.findOne({ userId: req.user.userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Delete profile picture if exists
    if (user.profilePicture) {
      const picturePath = path.join('uploads', 'profiles', path.basename(user.profilePicture));
      if (fs.existsSync(picturePath)) {
        fs.unlinkSync(picturePath);
      }
    }

    // Delete user
    await User.findOneAndDelete({ userId: req.user.userId });

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
};