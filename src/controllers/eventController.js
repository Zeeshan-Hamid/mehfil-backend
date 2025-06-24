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

// @desc    Get a single event
// @route   GET /api/events/:id
// @access  Public
exports.getEvent = catchAsync(async (req, res, next) => {
  const event = await Event.findById(req.params.id).populate({
    path: 'reviews.user',
    select: 'customerProfile.fullName customerProfile.profileImage' // Populate reviewer's name and image
  });

  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      event
    }
  });
});

// @desc    Update an event
// @route   PATCH /api/events/:id
// @access  Private (Owner vendor only)
exports.updateEvent = catchAsync(async (req, res, next) => {
  let event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // Check if the logged-in user is the vendor who owns the event
  if (event.vendor.toString() !== req.user.id) {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to perform this action.'
    });
  }

  // Prevent a user from changing the vendor associated with the event
  if (req.body.vendor) {
    delete req.body.vendor;
  }

  event = await Event.findByIdAndUpdate(req.params.id, req.body, {
    new: true, // Return the updated document
    runValidators: true // Run schema validators on update
  });

  res.status(200).json({
    status: 'success',
    data: {
      event
    }
  });
});

// @desc    Delete an event
// @route   DELETE /api/events/:id
// @access  Private (Owner vendor only)
exports.deleteEvent = catchAsync(async (req, res, next) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // Check if the logged-in user is the vendor who owns the event
  if (event.vendor.toString() !== req.user.id) {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to perform this action.'
    });
  }

  await Event.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null
  });
}); 