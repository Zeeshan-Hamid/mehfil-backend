const Event = require('../models/Event');
const { processAndUploadImages } = require('../services/fileUploadService');

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

  // 1. Check if files were uploaded
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      status: 'fail',
      message: 'You must upload at least one image for the event.'
    });
  }

  // 2. Process and upload images, get back the S3 URLs
  const imageUrls = await processAndUploadImages(req.files, vendorId);

  // 3. Parse stringified JSON fields from form-data
  const eventData = { ...req.body };
  if (eventData.packages) {
    eventData.packages = JSON.parse(eventData.packages);
  }
  if (eventData.location) {
    eventData.location = JSON.parse(eventData.location);
  }
  if (eventData.services) {
    eventData.services = JSON.parse(eventData.services);
  }
  if (eventData.tags) {
    eventData.tags = JSON.parse(eventData.tags);
  }

  // 4. Create the event
  const newEvent = await Event.create({
    ...eventData,
    imageUrls,
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
  const event = await Event.findById(req.params.id)
    .populate({
      path: 'reviews.user',
      select: 'customerProfile.fullName customerProfile.profileImage'
    })
    .populate({
      path: 'vendor',
      select: 'vendorProfile.ownerName role'
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

  const eventData = { ...req.body };

  // Parse stringified JSON fields from form-data
  if (eventData.packages) eventData.packages = JSON.parse(eventData.packages);
  if (eventData.location) eventData.location = JSON.parse(eventData.location);
  if (eventData.services) eventData.services = JSON.parse(eventData.services);
  if (eventData.tags) eventData.tags = JSON.parse(eventData.tags);
  
  // Process and upload new images if they exist
  if (req.files && req.files.length > 0) {
    const newImageUrls = await processAndUploadImages(req.files, req.user.id);
    // Add new URLs to the existing ones
    eventData.imageUrls = event.imageUrls.concat(newImageUrls);
  }

  event = await Event.findByIdAndUpdate(req.params.id, eventData, {
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
  // Note: This does not delete images from the S3 bucket.
  // A professional implementation would also trigger a delete operation on S3.
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
    message: 'Event deleted successfully'
  });
}); 