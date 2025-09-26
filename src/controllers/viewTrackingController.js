const mongoose = require('mongoose');
const viewTrackingService = require('../services/viewTrackingService');
const User = require('../models/User');
const ViewCount = require('../models/ViewCount');

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

// @desc    Get top 3 customers who viewed a specific vendor's events most
// @route   GET /api/analytics/vendor/top-customers
// @access  Private (Vendors only)
exports.getTopCustomers = catchAsync(async (req, res, next) => {
  const vendorId = req.user.id;
  const limit = parseInt(req.query.limit) || 3;
  const days = parseInt(req.query.days) || 7;

  console.log('------------ TOP CUSTOMERS REQUEST ------------');
  console.log('📊 [Controller] Get top customers request for vendor:', vendorId);

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Aggregate to get top customers by view count
    const topCustomers = await ViewCount.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          viewType: 'event',
          timestamp: { $gte: startDate },
          userId: { $exists: true, $ne: null } // Only include records with userId
        }
      },
      {
        $group: {
          _id: '$userId',
          viewCount: { $sum: 1 },
          lastViewed: { $max: '$timestamp' },
          eventsViewed: { $addToSet: '$eventId' }
        }
      },
      {
        $sort: { viewCount: -1 }
      },
      {
        $limit: limit
      },
      {
        $addFields: {
          userIdObjectId: { $toObjectId: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userIdObjectId',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      {
        $unwind: {
          path: '$customerInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          userId: '$_id',
          viewCount: 1,
          lastViewed: 1,
          eventsViewedCount: { $size: '$eventsViewed' },
          customerName: {
            $cond: {
              if: { $ne: ['$customerInfo', null] },
              then: '$customerInfo.customerProfile.fullName',
              else: 'Unknown Customer'
            }
          },
          customerEmail: {
            $cond: {
              if: { $ne: ['$customerInfo', null] },
              then: '$customerInfo.email',
              else: null
            }
          }
        }
      }
    ]);

    console.log('📈 [Controller] Top customers retrieved:', {
      vendorId,
      totalCustomers: topCustomers.length,
      days
    });
    console.log('------------ TOP CUSTOMERS REQUEST END ------------');

    res.status(200).json({
      success: true,
      data: {
        vendorId,
        period: `${days} days`,
        topCustomers: topCustomers.map((customer, index) => ({
          rank: index + 1,
          userId: customer.userId,
          customerName: customer.customerName,
          customerEmail: customer.customerEmail,
          viewCount: customer.viewCount,
          eventsViewedCount: customer.eventsViewedCount,
          lastViewed: customer.lastViewed
        }))
      }
    });

  } catch (error) {
    console.error('❌ [Controller] Error getting top customers:', error);
    console.log('------------ TOP CUSTOMERS REQUEST END (ERROR) ------------');
    
    return res.status(500).json({
      success: false,
      message: 'Failed to get top customers',
      error: error.message
    });
  }
});

// @desc    Get top 3 customers for all vendors (Admin only)
// @route   GET /api/analytics/admin/top-customers
// @access  Private (Admins only)
exports.getAllVendorsTopCustomers = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 3;
  const days = parseInt(req.query.days) || 7;

  console.log('------------ ALL VENDORS TOP CUSTOMERS REQUEST ------------');
  console.log('📊 [Controller] Get top customers for all vendors request');

  try {
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all vendors first
    const vendors = await User.find({ role: 'vendor' }).select('_id email vendorProfile.businessName');

    const vendorsWithTopCustomers = await Promise.all(
      vendors.map(async (vendor) => {
        const topCustomers = await ViewCount.aggregate([
          {
            $match: {
              vendorId: vendor._id,
              viewType: 'event',
              timestamp: { $gte: startDate },
              userId: { $exists: true, $ne: null }
            }
          },
          {
            $group: {
              _id: '$userId',
              viewCount: { $sum: 1 },
              lastViewed: { $max: '$timestamp' },
              eventsViewed: { $addToSet: '$eventId' }
            }
          },
          {
            $sort: { viewCount: -1 }
          },
          {
            $limit: limit
          },
          {
            $addFields: {
              userIdObjectId: { $toObjectId: '$_id' }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'userIdObjectId',
              foreignField: '_id',
              as: 'customerInfo'
            }
          },
          {
            $unwind: {
              path: '$customerInfo',
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $project: {
              userId: '$_id',
              viewCount: 1,
              lastViewed: 1,
              eventsViewedCount: { $size: '$eventsViewed' },
              customerName: {
                $cond: {
                  if: { $ne: ['$customerInfo', null] },
                  then: '$customerInfo.customerProfile.fullName',
                  else: 'Unknown Customer'
                }
              },
              customerEmail: {
                $cond: {
                  if: { $ne: ['$customerInfo', null] },
                  then: '$customerInfo.email',
                  else: null
                }
              }
            }
          }
        ]);

        return {
          vendorId: vendor._id,
          vendorName: vendor.vendorProfile?.businessName || vendor.email,
          vendorEmail: vendor.email,
          topCustomers: topCustomers.map((customer, index) => ({
            rank: index + 1,
            userId: customer.userId,
            customerName: customer.customerName,
            customerEmail: customer.customerEmail,
            viewCount: customer.viewCount,
            eventsViewedCount: customer.eventsViewedCount,
            lastViewed: customer.lastViewed
          }))
        };
      })
    );

    console.log('📈 [Controller] All vendors top customers retrieved:', {
      totalVendors: vendorsWithTopCustomers.length,
      days
    });
    console.log('------------ ALL VENDORS TOP CUSTOMERS REQUEST END ------------');

    res.status(200).json({
      success: true,
      data: {
        period: `${days} days`,
        vendors: vendorsWithTopCustomers
      }
    });

  } catch (error) {
    console.error('❌ [Controller] Error getting all vendors top customers:', error);
    console.log('------------ ALL VENDORS TOP CUSTOMERS REQUEST END (ERROR) ------------');
    
    return res.status(500).json({
      success: false,
      message: 'Failed to get all vendors top customers',
      error: error.message
    });
  }
});

module.exports = {
  trackView: exports.trackView,
  getVendorViewAnalytics: exports.getVendorViewAnalytics,
  getVendorViewCount: exports.getVendorViewCount,
  aggregateViews: exports.aggregateViews,
  getTopCustomers: exports.getTopCustomers,
  getAllVendorsTopCustomers: exports.getAllVendorsTopCustomers
};
