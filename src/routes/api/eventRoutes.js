const express = require('express');
const router = express.Router();
const reviewRouter = require('./reviewRoutes'); // Import review router
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const {
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  getVendorEvents,
  getAllEvents,
  getEventsByVendorPublic,
  getSimilarEvents
} = require('../../controllers/eventController');
const { uploadInMemory } = require('../../services/fileUploadService');


// --- PUBLIC ROUTES ---
router.get('/', getAllEvents);
router.get('/marketplace', getAllEvents);

// --- PROTECTED VENDOR-SPECIFIC ROUTES ---
// This route must come before the general '/:id' route to be matched correctly
router.get('/my-events', protect, restrictTo('vendor'), getVendorEvents);

// Get all active events for a specific vendor (for public vendor profile pages)
router.get('/vendor/:vendorId', getEventsByVendorPublic);

// Get a single event by its ID (public)
router.get('/:id', getEvent);

// Get similar events based on location
router.get('/:id/similar', getSimilarEvents);

// --- NESTED REVIEW ROUTES ---
// This will forward all routes starting with /:eventId/reviews to the reviewRouter
router.use('/:eventId/reviews', reviewRouter);


// --- PROTECTED VENDOR CRUD ROUTES ---
// Create a new event
router.post('/', protect, restrictTo('vendor'), uploadInMemory.array('images', 10), createEvent);

// Update an event
router.patch('/:id', protect, restrictTo('vendor'), uploadInMemory.array('images', 10), updateEvent);

// Delete an event
router.delete('/:id', protect, restrictTo('vendor'), deleteEvent);


module.exports = router; 