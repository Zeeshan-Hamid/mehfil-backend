const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const CheckoutSession = require('../models/CheckoutSession');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Invoice = require('../models/Invoice');
const ViewCount = require('../models/ViewCount');
const { processAndUploadProfileImage } = require('../services/fileUploadService');
const { validationResult } = require('express-validator');

// Async error handling wrapper
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

exports.getVendorProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vendor = await User.findOne({ _id: id, role: 'vendor' }).select(
      'vendorProfile'
    );

    if (!vendor) {
      return res.status(404).json({
        status: 'fail',
        message: 'No vendor found with that ID'
      });
    }

    const events = await Event.find({ vendor: id });

    res.status(200).json({
      status: 'success',
      data: {
        vendor,
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current vendor's profile
// @route   GET /api/vendor/profile
// @access  Private (Vendors only)
exports.getCurrentVendorProfile = catchAsync(async (req, res, next) => {
  const vendorId = req.user.id;

  const vendor = await User.findById(vendorId).select(
    'email phoneNumber vendorProfile vendorVerificationStatus vendorVerificationDate vendorVerificationNotes'
  );

  if (!vendor) {
    return res.status(404).json({
      status: 'fail',
      message: 'Vendor not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      vendor
    }
  });
});

// @desc    Update vendor profile general settings
// @route   PUT /api/vendor/profile/general
// @access  Private (Vendors only)
exports.updateVendorGeneralProfile = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const vendorId = req.user.id;
  const updateData = req.body;

  const vendor = await User.findById(vendorId);

  if (!vendor) {
    return res.status(404).json({
      status: 'fail',
      message: 'Vendor not found'
    });
  }

  if (vendor.role !== 'vendor') {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied. Only vendors can access this resource.'
    });
  }

  // Handle vendor profile image upload if present
  if (req.files && req.files.vendorProfileImage) {
    try {
      const profileImageFile = req.files.vendorProfileImage[0];
      const vendorProfileImageUrl = await processAndUploadProfileImage(profileImageFile, vendorId);
      updateData.vendorProfileImage = vendorProfileImageUrl;
    } catch (error) {
      // Error uploading vendor profile image
      return res.status(500).json({
        status: 'fail',
        message: 'Failed to upload vendor profile image'
      });
    }
  }

  // Handle halal certification image upload if present
  if (req.files && req.files.halalCertificationImage) {
    try {
      const halalCertFile = req.files.halalCertificationImage[0];
      
      // Check if it's an image file
      if (halalCertFile.mimetype.startsWith('image/')) {
        // Use image processing for image files
        const certificationFileUrl = await processAndUploadProfileImage(halalCertFile, vendorId);
        updateData.halalCertificationFile = certificationFileUrl;
      } else {
        // Use raw upload for non-image files (PDF, etc.)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = halalCertFile.originalname.split('.').pop();
        const newFilename = `halal-certifications/${vendorId}-${uniqueSuffix}.${extension}`;

        // Upload to S3 
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_KEY,
          region: process.env.AWS_REGION
        });

        await s3.upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: newFilename,
          Body: halalCertFile.buffer,
          ContentType: halalCertFile.mimetype,
          CacheControl: 'public, max-age=31536000'
        }).promise();

        const certificationFileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFilename}`;
        updateData.halalCertificationFile = certificationFileUrl;
      }
    } catch (error) {
      // Error uploading halal certification file
      return res.status(500).json({
        status: 'fail',
        message: 'Failed to upload halal certification file'
      });
    }
  }

  // Update vendor profile fields
  if (updateData.businessName) {
    vendor.vendorProfile.businessName = updateData.businessName;
  }

  if (updateData.ownerName) {
    vendor.vendorProfile.ownerName = updateData.ownerName;
  }

  if (updateData.phoneNumber) {
    vendor.phoneNumber = updateData.phoneNumber;
  }

  // Update business address (street, city, state are optional)
  if (updateData.businessAddress) {
    let addressData = updateData.businessAddress;
    if (typeof addressData === 'string') {
      try {
        addressData = JSON.parse(addressData);
      } catch (error) {
        // Error parsing business address data
      }
    }
    
    vendor.vendorProfile.businessAddress = {
      ...vendor.vendorProfile.businessAddress,
      ...addressData
    };
  }

  // Update individual address fields if provided
  if (updateData.street !== undefined) {
    vendor.vendorProfile.businessAddress.street = updateData.street || '';
  }
  if (updateData.city !== undefined) {
    vendor.vendorProfile.businessAddress.city = updateData.city || '';
  }
  if (updateData.state !== undefined) {
    vendor.vendorProfile.businessAddress.state = updateData.state || '';
  }
  if (updateData.country !== undefined) {
    vendor.vendorProfile.businessAddress.country = updateData.country;
  }
  if (updateData.zipCode !== undefined) {
    vendor.vendorProfile.businessAddress.zipCode = updateData.zipCode;
  }

  // Update vendor profile image if provided
  if (updateData.vendorProfileImage) {
    vendor.vendorProfile.vendorProfileImage = updateData.vendorProfileImage;
  }

  // Update halal certification fields if provided
  if (updateData.hasHalalCert !== undefined) {
    vendor.vendorProfile.halalCertification.hasHalalCert = updateData.hasHalalCert;
  }

  if (updateData.halalCertificationFile) {
    vendor.vendorProfile.halalCertification.certificationFile = updateData.halalCertificationFile;
  }

  if (updateData.certificateNumber) {
    vendor.vendorProfile.halalCertification.certificateNumber = updateData.certificateNumber;
  }

  if (updateData.issuingAuthority) {
    vendor.vendorProfile.halalCertification.issuingAuthority = updateData.issuingAuthority;
  }

  if (updateData.expiryDate) {
    vendor.vendorProfile.halalCertification.expiryDate = new Date(updateData.expiryDate);
  }

  // Save the vendor
  // Saving vendor profile
  
  await vendor.save();
  // Vendor profile saved successfully

  res.status(200).json({
    status: 'success',
    message: 'Vendor profile updated successfully',
    data: {
      user: {
        _id: vendor._id,
        email: vendor.email,
        phoneNumber: vendor.phoneNumber,
        vendorProfile: vendor.vendorProfile,
        vendorVerificationStatus: vendor.vendorVerificationStatus,
        vendorVerificationDate: vendor.vendorVerificationDate,
        vendorVerificationNotes: vendor.vendorVerificationNotes
      }
    }
  });
});

// @desc    Delete vendor account and related data
// @route   DELETE /api/vendor/account
// @access  Private (Vendors only)
exports.deleteVendorAccount = catchAsync(async (req, res, next) => {
  const vendorId = req.user.id;

  const vendor = await User.findById(vendorId);
  if (!vendor) {
    return res.status(404).json({
      status: 'fail',
      message: 'Vendor not found'
    });
  }

  if (vendor.role !== 'vendor') {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied. Only vendors can delete their account.'
    });
  }

  // Check for active bookings
  const activeBookings = await Booking.find({ 
    vendor: vendorId, 
    status: { $in: ['Pending', 'Confirmed'] } 
  });
  
  if (activeBookings.length > 0) {
    return res.status(400).json({
      status: 'fail',
      message: `Cannot delete account with ${activeBookings.length} active booking(s). Please cancel or complete all bookings first.`,
      activeBookings: activeBookings.length
    });
  }

  // Check for pending payments
  const pendingPayments = await CheckoutSession.find({ 
    vendorId: vendorId, 
    status: 'pending' 
  });
  
  if (pendingPayments.length > 0) {
    return res.status(400).json({
      status: 'fail',
      message: `Cannot delete account with ${pendingPayments.length} pending payment(s). Please resolve all payment issues first.`,
      pendingPayments: pendingPayments.length
    });
  }

  // Perform cleanup of related data
  try {
    await Promise.all([
      // Delete all events (listings) created by this vendor
      Event.deleteMany({ vendor: vendorId }),
      // Delete all bookings for this vendor
      Booking.deleteMany({ vendor: vendorId }),
      // Delete all reviews for this vendor
      Review.deleteMany({ vendor: vendorId }),
      // Delete all checkout sessions for this vendor
      CheckoutSession.deleteMany({ vendorId: vendorId }),
      // Delete all notifications for this vendor
      Notification.deleteMany({ 
        $or: [
          { recipient: vendorId },
          { sender: vendorId }
        ]
      }),
      // Delete all messages for this vendor
      Message.deleteMany({
        $or: [
          { sender: vendorId },
          { recipient: vendorId }
        ]
      }),
      // Delete all invoices for this vendor
      Invoice.deleteMany({ vendor: vendorId }),
      // Delete all view counts for this vendor
      ViewCount.deleteMany({ vendorId: vendorId })
    ]);
  } catch (cleanupError) {
    console.error('Error during account cleanup:', cleanupError);
    // Continue to delete user even if some cleanup operations fail
  }

  // Finally delete the user account itself
  await User.findByIdAndDelete(vendorId);

  return res.status(200).json({
    status: 'success',
    message: 'Your account has been permanently deleted.'
  });
});
