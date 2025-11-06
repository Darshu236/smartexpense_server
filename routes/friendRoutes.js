// routes/friendRoutes.js - Updated to work with unified friend system
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import friendController from '../controllers/friendController.js';
const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    system: 'friends',
    timestamp: new Date().toISOString()
  });
});

// Get all friends
router.get('/', friendController.getAllFriends);

// Search users
router.get('/search', friendController.searchUsers);

// Add friend
router.post('/add', friendController.addFriend);

// Remove friend
router.delete('/:friendId', friendController.removeFriend);

// Get specific friend by ID (for split expense validation)
router.get('/:friendId', friendController.getFriendById);


export default router;