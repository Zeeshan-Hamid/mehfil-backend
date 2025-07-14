const Event = require('../models/Event');
const User = require('../models/User');
const mongoose = require('mongoose');

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Create a custom package for a specific customer
// @route   POST /api/custom-packages/:eventId
// @access  Private (Vendors only)
exports.createCustomPackage = catchAsync(async (req, res, next) => {
  // Debug: Check if user object exists
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. User object not found.'
    });
  }

  if (!req.user.id) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. User ID not found.'
    });
  }

  const { eventId } = req.params;
  const vendorId = req.user.id;
  const { customerId, name, price, currency, includes, description } = req.body;

  // Validate required fields
  if (!customerId || !name || !price || !includes) {
    return res.status(400).json({
      success: false,
      message: 'Please provide customerId, name, price, and includes.'
    });
  }

  // Check if event exists and belongs to the vendor
  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found.'
    });
  }

  if (event.vendor.toString() !== vendorId) {
    return res.status(403).json({
      success: false,
      message: 'You can only create custom packages for your own events.'
    });
  }

  // Check if customer exists and is actually a customer
  const customer = await User.findById(customerId);
  if (!customer || customer.role !== 'customer') {
    return res.status(404).json({
      success: false,
      message: 'Customer not found.'
    });
  }

  // Create the custom package
  const customPackage = {
    name,
    price,
    currency: currency || 'USD',
    includes,
    description: description || '',
    createdFor: customerId,
    createdBy: vendorId,
    isActive: true
  };

  event.customPackages.push(customPackage);
  await event.save();

  // Get the created package with its ID
  const createdPackage = event.customPackages[event.customPackages.length - 1];

  res.status(201).json({
    success: true,
    message: 'Custom package created successfully.',
    data: {
      customPackage: createdPackage
    }
  });
});

// @desc    Get custom packages for a specific event (customer can only see packages created for them)
// @route   GET /api/custom-packages/:eventId
// @access  Private (Customers only)
exports.getCustomPackagesForEvent = catchAsync(async (req, res, next) => {
  const { eventId } = req.params;
  const customerId = req.user.id;

  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Only customers can view custom packages.'
    });
  }

  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found.'
    });
  }

  // Filter custom packages to only show those created for this customer
  const customPackages = event.customPackages.filter(pkg => 
    pkg.createdFor.toString() === customerId && pkg.isActive
  );

  res.status(200).json({
    success: true,
    data: {
      eventId,
      customPackages
    }
  });
});

// @desc    Get all custom packages created by a vendor
// @route   GET /api/custom-packages/vendor/my-packages
// @access  Private (Vendors only)
exports.getVendorCustomPackages = catchAsync(async (req, res, next) => {
  const vendorId = req.user.id;

  // Check if user is a vendor
  if (req.user.role !== 'vendor') {
    return res.status(403).json({
      success: false,
      message: 'Only vendors can view their custom packages.'
    });
  }

  const events = await Event.find({ vendor: vendorId })
    .select('name customPackages')
    .populate({
      path: 'customPackages.createdFor',
      select: 'customerProfile.fullName email'
    });

  const customPackages = [];
  events.forEach(event => {
    event.customPackages.forEach(pkg => {
      customPackages.push({
        _id: pkg._id,
        eventId: event._id,
        eventName: event.name,
        packageName: pkg.name,
        price: pkg.price,
        currency: pkg.currency,
        createdFor: pkg.createdFor,
        createdAt: pkg.createdAt,
        isActive: pkg.isActive
      });
    });
  });

  res.status(200).json({
    success: true,
    data: {
      customPackages
    }
  });
});

// @desc    Update a custom package (vendor can update their own packages)
// @route   PATCH /api/custom-packages/:eventId/:packageId
// @access  Private (Vendors only)
exports.updateCustomPackage = catchAsync(async (req, res, next) => {
  const { eventId, packageId } = req.params;
  const vendorId = req.user.id;
  const updates = req.body;

  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found.'
    });
  }

  if (event.vendor.toString() !== vendorId) {
    return res.status(403).json({
      success: false,
      message: 'You can only update custom packages for your own events.'
    });
  }

  const customPackage = event.customPackages.id(packageId);
  if (!customPackage) {
    return res.status(404).json({
      success: false,
      message: 'Custom package not found.'
    });
  }

  // Update allowed fields
  if (updates.name) customPackage.name = updates.name;
  if (updates.price !== undefined) customPackage.price = updates.price;
  if (updates.currency) customPackage.currency = updates.currency;
  if (updates.includes) customPackage.includes = updates.includes;
  if (updates.description !== undefined) customPackage.description = updates.description;
  if (updates.isActive !== undefined) customPackage.isActive = updates.isActive;

  await event.save();

  res.status(200).json({
    success: true,
    message: 'Custom package updated successfully.',
    data: {
      customPackage
    }
  });
});

// @desc    Delete a custom package (vendor can delete their own packages)
// @route   DELETE /api/custom-packages/:eventId/:packageId
// @access  Private (Vendors only)
exports.deleteCustomPackage = catchAsync(async (req, res, next) => {
  const { eventId, packageId } = req.params;
  const vendorId = req.user.id;

  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found.'
    });
  }

  if (event.vendor.toString() !== vendorId) {
    return res.status(403).json({
      success: false,
      message: 'You can only delete custom packages for your own events.'
    });
  }

  const packageIndex = event.customPackages.findIndex(pkg => pkg._id.toString() === packageId);
  if (packageIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Custom package not found.'
    });
  }

  event.customPackages.splice(packageIndex, 1);
  await event.save();

  res.status(200).json({
    success: true,
    message: 'Custom package deleted successfully.'
  });
});

module.exports = {
  createCustomPackage: exports.createCustomPackage,
  getCustomPackagesForEvent: exports.getCustomPackagesForEvent,
  getVendorCustomPackages: exports.getVendorCustomPackages,
  updateCustomPackage: exports.updateCustomPackage,
  deleteCustomPackage: exports.deleteCustomPackage
}; 