const User = require('../models/User');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const UserEvent = require('../models/UserEvent');
const Todo = require('../models/Todo');
const Event = require('../models/Event');
const Review = require('../models/Review');
const CheckoutSession = require('../models/CheckoutSession');
const { processAndUploadProfileImage } = require('../services/fileUploadService');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get customer profile
// @route   GET /api/customer/profile
// @access  Private (Customers only)
exports.getCustomerProfile = catchAsync(async (req, res, next) => {
  const customerId = req.user.id;

  const customer = await User.findById(customerId)
    .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires');

  if (!customer) {
    return res.status(404).json({
      status: 'fail',
      message: 'Customer not found'
    });
  }

  if (customer.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied. Only customers can access this resource.'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      customer
    }
  });
});

// @desc    Update customer profile
// @route   PUT /api/customer/profile
// @access  Private (Customers only)
exports.updateCustomerProfile = catchAsync(async (req, res, next) => {
  const customerId = req.user.id;
  const updateData = req.body;

  const customer = await User.findById(customerId);

  if (!customer) {
    return res.status(404).json({
      status: 'fail',
      message: 'Customer not found'
    });
  }

  if (customer.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied. Only customers can access this resource.'
    });
  }

  // Handle profile image upload if present
  if (req.file) {
    try {
      const profileImageUrl = await processAndUploadProfileImage(req.file, customerId);
      updateData.profileImage = profileImageUrl;
    } catch (error) {
      console.error('Error uploading profile image:', error);
      return res.status(500).json({
        status: 'fail',
        message: 'Failed to upload profile image'
      });
    }
  }

  // Update customer profile fields
  if (updateData.fullName) {
    customer.customerProfile.fullName = updateData.fullName;
  }

  if (updateData.gender) {
    customer.customerProfile.gender = updateData.gender;
  }

  if (updateData.location) {
    // Parse location if it's a JSON string
    let locationData = updateData.location;
    if (typeof locationData === 'string') {
      try {
        locationData = JSON.parse(locationData);
      } catch (error) {
        console.error('Error parsing location data:', error);
      }
    }
    
    customer.customerProfile.location = {
      ...customer.customerProfile.location,
      ...locationData
    };
  }

  if (updateData.profileImage) {
    customer.customerProfile.profileImage = updateData.profileImage;
  }

  if (updateData.phoneNumber) {
    customer.phoneNumber = updateData.phoneNumber;
  }

  if (updateData.preferences) {
    // Parse preferences if it's a JSON string
    let preferencesData = updateData.preferences;
    if (typeof preferencesData === 'string') {
      try {
        preferencesData = JSON.parse(preferencesData);
      } catch (error) {
        console.error('Error parsing preferences data:', error);
      }
    }
    
    customer.customerProfile.preferences = {
      ...customer.customerProfile.preferences,
      ...preferencesData
    };
  }

  // Mark profile as completed if all required fields are present
  if (customer.customerProfile.fullName && 
      customer.customerProfile.gender && 
      customer.customerProfile.location.city && 
      customer.customerProfile.location.state && 
      customer.customerProfile.location.country) {
    customer.customerProfile.profileCompleted = true;
  }

  await customer.save();

  res.status(200).json({
    status: 'success',
    message: 'Customer profile updated successfully',
    data: {
      customer: {
        _id: customer._id,
        email: customer.email,
        role: customer.role,
        phoneNumber: customer.phoneNumber,
        customerProfile: customer.customerProfile
      }
    }
  });
});

// @desc    Delete customer account and related data
// @route   DELETE /api/customer/account
// @access  Private (Customers only)
exports.deleteCustomerAccount = catchAsync(async (req, res, next) => {
  const customerId = req.user.id;

  const customer = await User.findById(customerId);
  if (!customer) {
    return res.status(404).json({
      status: 'fail',
      message: 'Customer not found'
    });
  }

  if (customer.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied. Only customers can delete their account.'
    });
  }

  // Perform cleanup of related data
  try {
    await Promise.all([
      // Delete bookings made by the customer
      Booking.deleteMany({ customer: customerId }),
      // Delete messages where the user is sender or receiver
      Message.deleteMany({ $or: [ { sender: customerId }, { receiver: customerId } ] }),
      // Delete notifications either sent to or sent by the user
      Notification.deleteMany({ $or: [ { recipient: customerId }, { sender: customerId } ] }),
      // Delete personal planning data
      UserEvent.deleteMany({ user: customerId }),
      Todo.deleteMany({ user: customerId }),
      // Delete standalone reviews created by the customer
      Review.deleteMany({ customer: customerId }),
      // Remove embedded event reviews authored by this user (legacy path)
      Event.updateMany({}, { $pull: { reviews: { user: customerId } } }),
      // Delete any pending/recorded checkout sessions
      CheckoutSession.deleteMany({ user: customerId }),
      // Remove any vendor custom packages created for this customer
      Event.updateMany(
        { 'customPackages.createdFor': customerId },
        { $pull: { customPackages: { createdFor: customerId } } }
      )
    ]);
  } catch (cleanupError) {
    console.error('Error during account cleanup:', cleanupError);
    // Continue to delete user even if some cleanup operations fail
  }

  // Finally delete the user account itself
  await User.findByIdAndDelete(customerId);

  return res.status(200).json({
    status: 'success',
    message: 'Your account has been permanently deleted.'
  });
});

module.exports = {
  getCustomerProfile: exports.getCustomerProfile,
  updateCustomerProfile: exports.updateCustomerProfile,
  deleteCustomerAccount: exports.deleteCustomerAccount
}; 