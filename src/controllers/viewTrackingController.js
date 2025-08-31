const viewTrackingService = require('../services/viewTrackingService');
const User = require('../models/User');

// Simple async wrapper
const catchAsync = fn => (req, res, next) => fn(req, res, next).catch(next);

// @desc    Track a view for a vendor profile or event
// @route   POST /api/analytics/track-view
// @access  Public
exports.trackView = catchAsync(async (req, res, next) => {
  const { vendorId, eventId, userId } = req.body;
  const timestamp = new Date().toISOString();
  
  console.log(`------------ VIEW TRACKING REQUEST [${timestamp}] ------------`);
  console.log(`📥 [Controller] Track view request received at ${timestamp}:`, {
    vendorId,
    eventId,
    userId: userId || 'not-provided',
    ip: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent')?.substring(0, 50) + '...',
    viewerId: req.user?.id || 'anonymous'
  });

  if (!vendorId) {
    console.log('❌ [Controller] Missing vendorId in request');
    console.log('------------ VIEW TRACKING REQUEST END ------------');
    return res.status(400).json({
      success: false,
      message: 'vendorId is required'
    });
  }

  // Verify vendor exists
  const vendor = await User.findById(vendorId);
  if (!vendor || vendor.role !== 'vendor') {
    console.log('❌ [Controller] Vendor not found:', vendorId);
    console.log('------------ VIEW TRACKING REQUEST END ------------');
    return res.status(404).json({
      success: false,
      message: 'Vendor not found'
    });
  }

  console.log('✅ [Controller] Vendor verified:', vendor.vendorProfile?.businessName || vendor.email);

  // Track the view
  const result = await viewTrackingService.trackView(vendorId, eventId, req);

  if (!result.success) {
    console.log('❌ [Controller] Failed to track view:', result.error);
    console.log('------------ VIEW TRACKING REQUEST END ------------');
    return res.status(500).json({
      success: false,
      message: 'Failed to track view',
      error: result.error
    });
  }

  console.log('✅ [Controller] View tracking completed:', {
    isUnique: result.isUnique,
    viewId: result.viewId
  });
  console.log('------------ VIEW TRACKING REQUEST END ------------');

  res.status(200).json({
    success: true,
    message: 'View tracked successfully',
    data: {
      isUnique: result.isUnique,
      viewId: result.viewId
    }
  });
});

// @desc    Get view analytics for a vendor
// @route   GET /api/analytics/vendor/views
// @access  Private (Vendors only)
exports.getVendorViewAnalytics = catchAsync(async (req, res, next) => {
  const vendorId = req.user.id;
  const days = parseInt(req.query.days || '30');

  const result = await viewTrackingService.getVendorViewAnalytics(vendorId, days);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get view analytics',
      error: result.error
    });
  }

  res.status(200).json({
    success: true,
    data: result.data
  });
});

// @desc    Get current view count for a vendor
// @route   GET /api/analytics/vendor/view-count
// @access  Private (Vendors only)
exports.getVendorViewCount = catchAsync(async (req, res, next) => {
  const vendorId = req.user.id;

  console.log('------------ VIEW COUNT REQUEST ------------');
  console.log('📊 [Controller] Get view count request for vendor:', vendorId);

  const vendor = await User.findById(vendorId).select('vendorProfile.analytics');
  
  if (!vendor) {
    console.log('❌ [Controller] Vendor not found for view count:', vendorId);
    console.log('------------ VIEW COUNT REQUEST END ------------');
    return res.status(404).json({
      success: false,
      message: 'Vendor not found'
    });
  }

  const analytics = vendor.vendorProfile?.analytics || {};
  const viewCount = analytics.profileViews || { total: 0, unique: 0, lastUpdated: new Date() };
  const viewHistory = analytics.viewHistory || { daily: 0, weekly: 0, monthly: 0 };

  console.log('📈 [Controller] View count retrieved:', {
    vendorId,
    totalViews: viewCount.total,
    uniqueViews: viewCount.unique,
    lastUpdated: viewCount.lastUpdated
  });
  console.log('------------ VIEW COUNT REQUEST END ------------');

  res.status(200).json({
    success: true,
    data: {
      viewCount: {
        total: viewCount.unique, // Return unique views as total
        unique: viewCount.unique,
        lastUpdated: viewCount.lastUpdated
      },
      viewHistory
    }
  });
});

// @desc    Manually trigger view count aggregation (for testing)
// @route   POST /api/analytics/aggregate-views
// @access  Private (Admins only)
exports.aggregateViews = catchAsync(async (req, res, next) => {
  // Check if user is admin
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only admins can trigger aggregation'
    });
  }

  const result = await viewTrackingService.aggregateViewCounts();

  if (!result.success) {
    return res.status(500).json({
      success: false,
      message: 'Failed to aggregate views',
      error: result.error
    });
  }

  res.status(200).json({
    success: true,
    message: 'View aggregation completed',
    data: {
      updatedVendors: result.updatedVendors
    }
  });
});

module.exports = {
  trackView: exports.trackView,
  getVendorViewAnalytics: exports.getVendorViewAnalytics,
  getVendorViewCount: exports.getVendorViewCount,
  aggregateViews: exports.aggregateViews
};
