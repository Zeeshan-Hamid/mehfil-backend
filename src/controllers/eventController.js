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
// Using a custom try-catch block here instead of catchAsync to handle specific MongoDB errors
exports.createEvent = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { name, category } = req.body;

    // 1. Application-level check for better UX
    const existingEvent = await Event.findOne({ vendor: vendorId, name, category });
    if (existingEvent) {
      return res.status(409).json({ // 409 Conflict
        status: 'fail',
        message: 'You already have an event with this name and category. Please choose a different name or category.'
      });
    }

    // 2. Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'You must upload at least one image for the event.'
      });
    }

    // 3. Process and upload images, get back the S3 URLs
    const imageUrls = await processAndUploadImages(req.files, vendorId);

    // 4. Parse stringified JSON fields from form-data
    const eventData = { ...req.body };
    if (eventData.packages) eventData.packages = JSON.parse(eventData.packages);
    if (eventData.location) eventData.location = JSON.parse(eventData.location);
    if (eventData.services) eventData.services = JSON.parse(eventData.services);
    if (eventData.tags) eventData.tags = JSON.parse(eventData.tags);
    if (eventData.flatPrice) eventData.flatPrice = JSON.parse(eventData.flatPrice);
    
    // Handle boolean fields that come as strings from form-data
    if (eventData.flexible_price !== undefined) {
      eventData.flexible_price = eventData.flexible_price === 'true' || eventData.flexible_price === true;
    }

    // 5. Create the event
    const newEvent = await Event.create({
      ...eventData,
      imageUrls,
      vendor: vendorId
    });

    res.status(201).json({
      status: 'success',
      data: {
        event: newEvent
      }
    });
  } catch (error) {
    // 6. DB-level check for race conditions
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'fail',
        message: 'An event with this name and category already exists. Please choose a different name or category.'
      });
    }
    // Pass other errors to the global handler
    next(error);
  }
};

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
      select: 'vendorProfile email phoneNumber'
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
  if (eventData.flatPrice) eventData.flatPrice = JSON.parse(eventData.flatPrice);
  
  // Handle boolean fields that come as strings from form-data
  if (eventData.flexible_price !== undefined) {
    eventData.flexible_price = eventData.flexible_price === 'true' || eventData.flexible_price === true;
  }
  
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

// @desc    Get all active events from all vendors (for customer browsing/marketplace)
// @route   GET /api/events
// @access  Public
exports.getAllEvents = catchAsync(async (req, res, next) => {
  try {
    // Helper function to escape special regex characters
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    // 1. Extract pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12; // Default 12 for grid layout
    const skip = (page - 1) * limit;

    // 2. Build query with filters
    const queryObj = {};

    // Filter by category
    if (req.query.category) {
      queryObj.category = req.query.category;
    }

    // Filter by location (city, state, or zipCode)
    if (req.query.city) {
      // Create a case-insensitive query that allows partial matches for city
      queryObj['location.city'] = { $regex: escapeRegExp(req.query.city), $options: 'i' };
    }

    if (req.query.state) {
      // Create a case-insensitive query that allows partial matches for state
      queryObj['location.state'] = { $regex: escapeRegExp(req.query.state), $options: 'i' };
    }

    if (req.query.zipCode) {
      queryObj['location.zipCode'] = req.query.zipCode;
    }

    // Filter by event rating (using the averageRating field)
    if (req.query.rating) {
      const rating = parseFloat(req.query.rating);
      if (!isNaN(rating) && rating >= 0 && rating <= 5) {
        // Find events with the specified average rating (exact match with small tolerance)
        // Convert to number to ensure proper comparison in MongoDB
        const minRating = Math.max(0, rating - 0.2);
        const maxRating = Math.min(5, rating + 0.2);
        queryObj.averageRating = { $gte: minRating, $lte: maxRating };
        console.log(`Filtering by rating: ${rating}, range: ${minRating} to ${maxRating}`);
      } else {
        console.log(`Invalid rating value: ${req.query.rating}`);
      }
    }

    // Filter by price range (if events have a starting price)
    if (req.query.minPrice) {
      const minPrice = parseFloat(req.query.minPrice);
      if (!isNaN(minPrice) && minPrice >= 0) {
        queryObj['packages.price'] = { $gte: minPrice };
      }
    }

    if (req.query.maxPrice) {
      const maxPrice = parseFloat(req.query.maxPrice);
      if (!isNaN(maxPrice) && maxPrice >= 0) {
        if (!queryObj['packages.price']) {
          queryObj['packages.price'] = {};
        }
        queryObj['packages.price'].$lte = maxPrice;
      }
    }

    // Filter by tags
    if (req.query.tags) {
      const tags = req.query.tags.split(',').map(tag => tag.trim());
      queryObj.tags = { $in: tags };
    }

    // 3. Determine sort order
    let sortOption = { createdAt: -1 }; // Default: newest first
    
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'price-asc':
          sortOption = { 'packages.price': 1 };
          break;
        case 'price-desc':
          sortOption = { 'packages.price': -1 };
          break;
        case 'rating-desc':
          sortOption = { averageRating: -1 };
          break;
        case 'reviews-desc':
          sortOption = { totalReviews: -1 };
          break;
        case 'name-asc':
          sortOption = { name: 1 };
          break;
        default:
          sortOption = { createdAt: -1 }; // Default to newest
      }
    }

    // Log the final query for debugging
    console.log('Final query:', JSON.stringify(queryObj));
    
    // 4. Execute query with pagination
    const events = await Event.find(queryObj)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .select('name category description imageUrls location averageRating totalReviews tags createdAt packages flexible_price')
      .populate({
        path: 'vendor',
        select: 'vendorProfile.businessName vendorProfile.profileImage vendorProfile.rating'
      });
    
    // Log the number of events found
    console.log(`Found ${events.length} events matching the query`);
    
    // 5. Get total count for pagination
    const totalEvents = await Event.countDocuments(queryObj);

    // 6. Send response
    res.status(200).json({
      status: 'success',
      results: events.length,
      data: {
        events,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalEvents / limit),
          totalEvents,
          limit,
          hasNextPage: skip + events.length < totalEvents,
          hasPrevPage: page > 1
        },
        filters: {
          applied: Object.keys(queryObj).length > 0,
          ...queryObj
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Error fetching marketplace events',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get all active events for a specific vendor (for public vendor profile)
// @route   GET /api/events/vendor/:vendorId
// @access  Public
exports.getEventsByVendorPublic = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // The query now only filters by vendorId, not status.
  const query = { vendor: vendorId };

  const events = await Event.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'vendor',
      select: 'vendorProfile.businessName'
    });

  const totalEvents = await Event.countDocuments(query);

  res.status(200).json({
    status: 'success',
    data: {
      events,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalEvents / limit),
        totalEvents,
        hasNextPage: skip + events.length < totalEvents,
        hasPrevPage: page > 1
      }
    }
  });
});

// @desc    Get all events for the LOGGED-IN vendor (for their dashboard)
// @route   GET /api/events/my-events
// @access  Private (Vendors only)
exports.getVendorEvents = catchAsync(async (req, res) => {
  // Get pagination parameters from query string with defaults
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // Build query
  const query = { vendor: req.user.id }; // Only get events for the logged-in vendor


  // Execute query with pagination
  const events = await Event.find(query)
    .sort({ createdAt: -1 }) // Sort by newest first
    .skip(skip)
    .limit(limit)
    .populate('vendor', 'vendorProfile.businessName vendorProfile.ownerName');

  // Get total count for pagination
  const totalEvents = await Event.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      events,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalEvents / limit),
        totalEvents,
        hasNextPage: skip + events.length < totalEvents,
        hasPrevPage: page > 1
      }
    }
  });
}); 

// @desc    Get similar events based on location (same state, city, or zip code)
// @route   GET /api/events/:id/similar
// @access  Public
exports.getSimilarEvents = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit, 10) || 5;

  // Get the current event to find its location
  const currentEvent = await Event.findById(id);
  if (!currentEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  // Build query to find events with similar location
  const locationQuery = {
    _id: { $ne: id }, // Exclude current event
    $or: [
      { 'location.state': currentEvent.location.state },
      { 'location.city': currentEvent.location.city },
      { 'location.zipCode': currentEvent.location.zipCode }
    ]
  };

  // Find similar events
  let similarEvents = await Event.find(locationQuery)
    .limit(limit)
    .populate({
      path: 'vendor',
      select: 'vendorProfile.businessName'
    })
    .select('name imageUrls location averageRating totalReviews category tags');

  // If no similar events found, try fallback strategies
  if (similarEvents.length === 0) {
    console.log('No similar events found, trying fallback strategies');
    
    // Strategy 1: Try events in the same category
    let fallbackEvents = await Event.find({
      _id: { $ne: id },
      category: currentEvent.category
    })
    .limit(limit)
    .populate({
      path: 'vendor',
      select: 'vendorProfile.businessName'
    })
    .select('name imageUrls location averageRating totalReviews category tags')
    .sort({ averageRating: -1, totalReviews: -1 });

    // Strategy 2: If still no events, get highest rated events
    if (fallbackEvents.length === 0) {
      fallbackEvents = await Event.find({
        _id: { $ne: id }
      })
      .limit(limit)
      .populate({
        path: 'vendor',
        select: 'vendorProfile.businessName'
      })
      .select('name imageUrls location averageRating totalReviews category tags')
      .sort({ averageRating: -1, totalReviews: -1 });
    }

    similarEvents = fallbackEvents;
  }

  // Transform the data to match frontend expectations
  const transformedEvents = similarEvents.map(event => ({
    id: event._id,
    name: event.name,
    image: event.imageUrls && event.imageUrls.length > 0 ? event.imageUrls[0] : '/default_dp.jpg',
    location: `${event.location.city}, ${event.location.state}`,
    rating: event.averageRating || 0,
    reviews: event.totalReviews || 0,
    category: event.category,
    tags: event.tags || []
  }));

  // Determine if we're showing fallback data and which strategy was used
  let fallbackType = 'none';
  if (similarEvents.length === 0) {
    fallbackType = 'none';
  } else {
    // Check if any events match the original location criteria
    const hasLocationMatch = similarEvents.some(event => 
      event.location.state === currentEvent.location.state ||
      event.location.city === currentEvent.location.city ||
      event.location.zipCode === currentEvent.location.zipCode
    );
    
    if (!hasLocationMatch) {
      // Check if we're showing same category events
      const hasCategoryMatch = similarEvents.some(event => 
        event.category === currentEvent.category
      );
      
      if (hasCategoryMatch) {
        fallbackType = 'category';
      } else {
        fallbackType = 'general';
      }
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      events: transformedEvents,
      count: transformedEvents.length,
      isFallback: fallbackType !== 'none',
      fallbackType: fallbackType
    }
  });
}); 