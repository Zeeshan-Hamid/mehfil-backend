const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all favorites for current user
// @route   GET /api/favorites
// @access  Private (Customer only)
exports.getFavorites = catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access favorites'
    });
  }

  // Find the user and populate their favorites with event details
  const user = await User.findById(userId).select('customerProfile.favorites')
    .populate({
      path: 'customerProfile.favorites.event',
      select: 'name category description imageUrls location averageRating totalReviews',
      populate: {
        path: 'vendor',
        select: 'vendorProfile.businessName'
      }
    });

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  res.status(200).json({
    status: 'success',
    results: user.customerProfile.favorites.length,
    data: {
      favorites: user.customerProfile.favorites
    }
  });
});

// @desc    Add event to favorites
// @route   POST /api/favorites/:eventId
// @access  Private (Customer only)
exports.addToFavorites = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { eventId } = req.params;

  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can add to favorites'
    });
  }

  // Validate eventId
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID'
    });
  }

  // Check if event exists
  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  // Find the user
  const user = await User.findById(userId);

  // Check if event is already in favorites
  const isAlreadyFavorite = user.customerProfile.favorites.some(
    favorite => favorite.event.toString() === eventId
  );

  if (isAlreadyFavorite) {
    return res.status(400).json({
      status: 'fail',
      message: 'Event is already in favorites'
    });
  }

  // Add to favorites
  user.customerProfile.favorites.push({
    event: eventId,
    addedAt: Date.now()
  });

  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Event added to favorites',
    data: {
      favorite: {
        event: eventId,
        addedAt: new Date()
      }
    }
  });
});

// @desc    Remove event from favorites
// @route   DELETE /api/favorites/:eventId
// @access  Private (Customer only)
exports.removeFromFavorites = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { eventId } = req.params;

  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can remove from favorites'
    });
  }

  // Find the user
  const user = await User.findById(userId);

  // Check if event is in favorites
  const favoriteIndex = user.customerProfile.favorites.findIndex(
    favorite => favorite.event.toString() === eventId
  );

  if (favoriteIndex === -1) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found in favorites'
    });
  }

  // Remove from favorites
  user.customerProfile.favorites.splice(favoriteIndex, 1);
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Event removed from favorites'
  });
});

module.exports = {
  getFavorites: exports.getFavorites,
  addToFavorites: exports.addToFavorites,
  removeFromFavorites: exports.removeFromFavorites
}; 