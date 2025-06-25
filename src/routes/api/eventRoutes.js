const express = require('express');
const router = express.Router();
const eventController = require('../../controllers/eventController');
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { uploadInMemory } = require('../../services/fileUploadService');

// @route   POST /api/events
// @desc    Create a new event
// @access  Private (Vendors only)
router.post(
  '/',
  protect,
  restrictTo('vendor'),
  uploadInMemory.array('images', 10), // Use in-memory upload
  eventController.createEvent
);

router
  .route('/:id')
  .get(eventController.getEvent)
  .patch(
    protect,
    restrictTo('vendor'),
    uploadInMemory.array('images', 10), // Use in-memory upload
    eventController.updateEvent
  )
  .delete(
    protect,
    restrictTo('vendor'),
    eventController.deleteEvent
  );

module.exports = router; 