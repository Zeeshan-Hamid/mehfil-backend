const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const {
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  getVendorEvents,
  getAllEvents,
  getEventsByVendorPublic
} = require('../../controllers/eventController');
const { uploadInMemory } = require('../../services/fileUploadService');


// --- PUBLIC ROUTES ---
// Get all active events with pagination for customer browsing
router.get('/', getAllEvents);

// Get all active events for a specific vendor (for public vendor profile pages)
router.get('/vendor/:vendorId', getEventsByVendorPublic);

// Get a single event by its ID
router.get('/:id', getEvent);


// --- PROTECTED VENDOR ROUTES ---
// This middleware protects all subsequent routes and ensures only vendors can access them
router.use(protect, restrictTo('vendor'));

// Get all events for the logged-in vendor (for their dashboard)
router.get('/my-events', getVendorEvents);

// Create a new event
router.post('/', uploadInMemory.array('images', 10), createEvent);

// Update an event
router.patch('/:id', uploadInMemory.array('images', 10), updateEvent);

// Delete an event
router.delete('/:id', deleteEvent);


module.exports = router; 