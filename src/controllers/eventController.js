const Event = require('../models/Event');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Create a new event
// @route   POST /api/events
// @access  Private (Vendors only)
exports.createEvent = catchAsync(async (req, res, next) => {
  // The vendor's ID is attached to the request by the 'protect' middleware
  const vendorId = req.user.id;

  const newEvent = await Event.create({
    ...req.body,
    vendor: vendorId // Ensure the event is linked to the logged-in vendor
  });

  res.status(201).json({
    status: 'success',
    data: {
      event: newEvent
    }
  });
}); 