const User = require('../models/User');
const Event = require('../models/Event');
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
      'vendorProfile email phoneNumber'
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
    'email phoneNumber vendorProfile'
  );

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
      console.error('Error uploading vendor profile image:', error);
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
      console.error('Error uploading halal certification file:', error);
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
        console.error('Error parsing business address data:', error);
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
  await vendor.save();

  res.status(200).json({
    status: 'success',
    message: 'Vendor profile updated successfully',
    data: {
      vendor: {
        _id: vendor._id,
        email: vendor.email,
        phoneNumber: vendor.phoneNumber,
        vendorProfile: vendor.vendorProfile
      }
    }
  });
});
