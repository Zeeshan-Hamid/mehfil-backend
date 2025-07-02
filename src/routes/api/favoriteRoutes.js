const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const {
  getFavorites,
  addToFavorites,
  removeFromFavorites
} = require('../../controllers/favoriteController');

// All favorites routes require authentication and are restricted to customers
router.use(protect, restrictTo('customer'));

// Get all favorites
router.get('/', getFavorites);

// Add event to favorites
router.post('/:eventId', addToFavorites);

// Remove event from favorites
router.delete('/:eventId', removeFromFavorites);

module.exports = router; 