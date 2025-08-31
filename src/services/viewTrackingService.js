const ViewCount = require('../models/ViewCount');
const User = require('../models/User');
const mongoose = require('mongoose');

class ViewTrackingService {
  // Generate a session ID for anonymous users
  generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Check for duplicate views (same session/IP within specified hours)
  async checkDuplicateView(vendorId, sessionId, ipAddress, userId, hours = 24) {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    // Build query based on whether user is logged in or anonymous
    let query = {
      vendorId,
      timestamp: { $gte: cutoffTime }
    };
    
    if (userId) {
      // For logged-in users, check by userId (from frontend)
      query.userId = userId;
      console.log(`🔍 [ViewTracking] Checking for duplicate view by userId: ${userId}`);
    } else {
      // For anonymous users, check by session only (removed IP constraint)
      query.sessionId = sessionId;
      console.log(`🔍 [ViewTracking] Checking for duplicate view by sessionId: ${sessionId}`);
    }
    
    const existingView = await ViewCount.findOne(query);

    return {
      isDuplicate: !!existingView,
      existingView
    };
  }

  // Get basic geolocation from IP (simplified version)
  async getGeoLocation(ipAddress) {
    // For now, return null. In production, you'd use a service like geoip-lite
    // const geo = require('geoip-lite').lookup(ipAddress);
    // return geo ? { country: geo.country, city: geo.city, coordinates: [geo.ll[1], geo.ll[0]] } : null;
    return null;
  }

  // Track view with deduplication
  async trackView(vendorId, eventId, req) {
    try {
      const timestamp = new Date().toISOString();
      console.log(`------------ VENDOR VIEW TRACKING START [${timestamp}] ------------`);
      console.log(`👁️ [ViewTracking] Starting view tracking for vendor: ${vendorId} at ${timestamp}`);
      console.log(`🔍 [ViewTracking] Request details:`, {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      });
      
      const sessionId = req.sessionID || this.generateSessionId();
      const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';
      const viewerId = req.user?.id;
      const userId = req.body.userId; // Get user ID from request body
      
              console.log('📊 [ViewTracking] View details:', {
          vendorId,
          eventId,
          sessionId: sessionId.substring(0, 8) + '...',
          ipAddress: ipAddress.substring(0, 15) + '...',
          userAgent: userAgent.substring(0, 50) + '...',
          referrer: req.get('Referrer') || 'direct',
          viewerId: viewerId || 'anonymous',
          userId: userId || 'not-provided',
          userType: userId ? 'logged-in' : 'anonymous'
        });
      
      // Check for duplicate views (same session/IP within 24h)
              const duplicateCheck = await this.checkDuplicateView(
          vendorId, sessionId, ipAddress, userId, 24
        );
      
      if (duplicateCheck.isDuplicate) {
        console.log(`🔄 [ViewTracking] Duplicate view detected, skipping at ${timestamp}`);
        console.log(`------------ VENDOR VIEW TRACKING END [${timestamp}] ------------`);
        return { success: true, isUnique: false };
      }
      
      // Get geolocation
      const geoLocation = await this.getGeoLocation(ipAddress);
      
      // Create view record
      const viewRecord = await ViewCount.create({
        vendorId,
        eventId,
        viewerId: req.user?.id,
        userId, // Store the user ID from frontend
        sessionId,
        ipAddress,
        userAgent,
        referrer: req.get('Referrer'),
        timestamp: new Date(),
        viewType: eventId ? 'event' : 'profile',
        isUnique: true,
        geoLocation
      });
      
      console.log(`✅ [ViewTracking] View tracked successfully at ${timestamp}:`, {
        viewId: viewRecord._id,
        vendorId,
        isUnique: true,
        viewType: eventId ? 'event' : 'profile'
      });
      
      console.log(`------------ VENDOR VIEW TRACKING END [${timestamp}] ------------`);
      return { success: true, isUnique: true, viewId: viewRecord._id };
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error(`💥 [ViewTracking] Error tracking view at ${errorTimestamp}:`, error);
      console.log(`------------ VENDOR VIEW TRACKING END (ERROR) [${errorTimestamp}] ------------`);
      return { success: false, error: error.message };
    }
  }

  // Batch aggregation (runs every 24 hours)
  async aggregateViewCounts() {
    try {
      const timestamp = new Date().toISOString();
      console.log(`------------ VIEW COUNT AGGREGATION START [${timestamp}] ------------`);
      console.log(`🔄 [Aggregation] Starting view count aggregation at ${timestamp}...`);
      
      // For testing: use last 1 hour instead of last 24 hours
      const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      console.log(`📅 [Aggregation] Aggregating views since: ${cutoffTime.toISOString()}`);
      
      // Aggregate views - count unique based on isUnique field (set by deduplication logic)
      const dailyStats = await ViewCount.aggregate([
        { $match: { timestamp: { $gte: cutoffTime } } },
        { $group: {
          _id: '$vendorId',
          totalViews: { $sum: 1 },
          uniqueViews: { $sum: { $cond: ['$isUnique', 1, 0] } }
        }}
      ]);
      
      console.log('📊 [Aggregation] Found stats for vendors:', dailyStats.length);
      
      // Update vendor profiles
      let updatedCount = 0;
      for (const stat of dailyStats) {
        console.log('📈 [Aggregation] Updating vendor:', stat._id, {
          totalViews: stat.totalViews,
          uniqueViews: stat.uniqueViews
        });
        
        await User.findByIdAndUpdate(stat._id, {
          $set: {
            'vendorProfile.analytics.profileViews.total': stat.totalViews,
            'vendorProfile.analytics.profileViews.unique': stat.uniqueViews,
            'vendorProfile.analytics.profileViews.lastUpdated': new Date(),
            'vendorProfile.analytics.viewHistory.daily': stat.uniqueViews
          }
        });
        updatedCount++;
      }
      
      console.log(`✅ [Aggregation] Updated view counts for ${updatedCount} vendors at ${timestamp}`);
      console.log(`------------ VIEW COUNT AGGREGATION END [${timestamp}] ------------`);
      return { success: true, updatedVendors: updatedCount };
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error(`💥 [Aggregation] Error aggregating view counts at ${errorTimestamp}:`, error);
      console.log(`------------ VIEW COUNT AGGREGATION END (ERROR) [${errorTimestamp}] ------------`);
      return { success: false, error: error.message };
    }
  }

  // Get view analytics for a vendor
  async getVendorViewAnalytics(vendorId, days = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const viewStats = await ViewCount.aggregate([
        { $match: { 
          vendorId: new mongoose.Types.ObjectId(vendorId),
          timestamp: { $gte: startDate }
        }},
        { $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          totalViews: { $sum: 1 },
          uniqueViews: { $sum: { $cond: ['$isUnique', 1, 0] } }
        }},
        { $sort: { _id: 1 } }
      ]);
      
      const summary = {
        totalViews: viewStats.reduce((sum, day) => sum + day.totalViews, 0),
        uniqueViews: viewStats.reduce((sum, day) => sum + day.uniqueViews, 0),
        averageDailyViews: viewStats.length > 0 ? 
          (viewStats.reduce((sum, day) => sum + day.uniqueViews, 0) / viewStats.length).toFixed(1) : 0
      };
      
      return {
        success: true,
        data: {
          viewStats,
          summary
        }
      };
    } catch (error) {
      console.error('Error getting vendor view analytics:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ViewTrackingService();
