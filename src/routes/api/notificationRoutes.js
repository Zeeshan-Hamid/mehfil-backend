const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');

const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markMultipleAsRead,
  deleteNotification,
  bulkDeleteNotifications,
  createNotification
} = require('../../controllers/notificationController');

// All routes are protected
router.use(protect);

// @route   GET /api/notifications
// @desc    Get all notifications for current user
// @access  Private
router.get('/', getNotifications);

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
router.get('/unread-count', getUnreadCount);

// @route   PATCH /api/notifications/mark-read
// @desc    Mark multiple notifications as read
// @access  Private
router.patch('/mark-read', markMultipleAsRead);

// @route   DELETE /api/notifications/bulk-delete
// @desc    Delete multiple notifications
// @access  Private
router.delete('/bulk-delete', bulkDeleteNotifications);

// @route   POST /api/notifications
// @desc    Create a notification
// @access  Private
router.post('/', createNotification);

// @route   PATCH /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.patch('/:id/read', markAsRead);

// @route   DELETE /api/notifications/:id
// @desc    Delete notification
// @access  Private
router.delete('/:id', deleteNotification);

module.exports = router;