const ViewCount = require('../models/ViewCount');
const mongoose = require('mongoose');

/**
 * Get profile view statistics for a vendor
 * @param {string} vendorId - The vendor's user ID
 * @param {string} period - Time period: 'daily', 'weekly', 'monthly', 'all'
 * @returns {Promise<Object>} View statistics
 */
const getProfileViewStats = async (vendorId, period = 'weekly') => {
    try {
        // Determine date range based on period
        let days;
        switch (period) {
            case 'daily':
                days = 1;
                break;
            case 'weekly':
                days = 7;
                break;
            case 'monthly':
                days = 30;
                break;
            case 'all':
                days = 90; // Max 90 days based on TTL
                break;
            default:
                days = 7;
        }

        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Get total and unique views for the period
        const viewStats = await ViewCount.aggregate([
            {
                $match: {
                    vendorId: new mongoose.Types.ObjectId(vendorId),
                    viewType: 'profile',
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
                    },
                    totalViews: { $sum: 1 },
                    uniqueViews: { $sum: { $cond: ['$isUnique', 1, 0] } }
                }
            },
            { $sort: { _id: -1 } }
        ]);

        if (!viewStats || viewStats.length === 0) {
            return {
                hasViews: false,
                period,
                days,
                message: `No profile views in the last ${days} day(s)`
            };
        }

        // Calculate summary
        const totalViews = viewStats.reduce((sum, day) => sum + day.totalViews, 0);
        const uniqueViews = viewStats.reduce((sum, day) => sum + day.uniqueViews, 0);
        const avgDailyViews = (uniqueViews / days).toFixed(1);

        // Get top viewing days
        const topDays = viewStats
            .sort((a, b) => b.uniqueViews - a.uniqueViews)
            .slice(0, 3)
            .map(day => ({
                date: day._id,
                views: day.uniqueViews
            }));

        return {
            hasViews: true,
            period,
            days,
            summary: {
                totalViews,
                uniqueViews,
                averageDailyViews: parseFloat(avgDailyViews)
            },
            topDays,
            dailyBreakdown: viewStats.map(day => ({
                date: day._id,
                total: day.totalViews,
                unique: day.uniqueViews
            }))
        };

    } catch (error) {
        console.error('Error in getProfileViewStats:', error);
        throw error;
    }
};

module.exports = {
    getProfileViewStats
};
