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
      // Checking for duplicate view by userId
    } else {
      // For anonymous users, check by session only (removed IP constraint)
      query.sessionId = sessionId;
      // Checking for duplicate view by sessionId
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
      // Starting view tracking for vendor
      
      const sessionId = req.sessionID || this.generateSessionId();
      const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';
      const viewerId = req.user?.id;
      const userId = req.body.userId; // Get user ID from request body
      
              // View details captured
      
      // Check for duplicate views (same session/IP within 24h)
              const duplicateCheck = await this.checkDuplicateView(
          vendorId, sessionId, ipAddress, userId, 24
        );
      
      if (duplicateCheck.isDuplicate) {
        // Duplicate view detected, skipping
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
      
      // View tracked successfully
      
      // View tracking completed
      return { success: true, isUnique: true, viewId: viewRecord._id };
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      // Error tracking view
      return { success: false, error: error.message };
    }
  }

  // Batch aggregation (runs every 24 hours)
  async aggregateViewCounts() {
    try {
      const timestamp = new Date().toISOString();
      // Starting view count aggregation
      
      // For testing: use last 1 hour instead of last 24 hours
      const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      // Aggregating views since cutoff time
      
      // Aggregate views - count unique based on isUnique field (set by deduplication logic)
      const dailyStats = await ViewCount.aggregate([
        { $match: { timestamp: { $gte: cutoffTime } } },
        { $group: {
          _id: '$vendorId',
          totalViews: { $sum: 1 },
          uniqueViews: { $sum: { $cond: ['$isUnique', 1, 0] } }
        }}
      ]);
      
      // Found stats for vendors
      
      // Update vendor profiles
      let updatedCount = 0;
      for (const stat of dailyStats) {
        // Updating vendor stats
        
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
      
      // Updated view counts for vendors
      return { success: true, updatedVendors: updatedCount };
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      // Error aggregating view counts
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
      // Error getting vendor view analytics
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ViewTrackingService();
