const SearchLog = require('../models/SearchLog');

/**
 * Get top search queries with frequency count
 * @param {number} limit - Number of top queries to return
 * @returns {Promise<Array>} Array of search queries with counts
 */
const getTopSearchQueries = async (limit = 50) => {
    try {
        const topQueries = await SearchLog.aggregate([
            {
                $group: {
                    _id: '$query',
                    count: { $sum: 1 },
                    lastSearched: { $max: '$timestamp' },
                    searchTypes: { $addToSet: '$type' },
                    userIds: { $addToSet: '$userId' }
                }
            },
            {
                $project: {
                    _id: 0,
                    query: '$_id',
                    count: 1,
                    lastSearched: 1,
                    searchTypes: 1,
                    uniqueUsers: { $size: '$userIds' },
                    hasGuestSearches: {
                        $in: [null, '$userIds']
                    }
                }
            },
            {
                $sort: { count: -1, lastSearched: -1 }
            },
            {
                $limit: limit
            }
        ]);

        return topQueries;
    } catch (error) {
        console.error('Error fetching top search queries:', error);
        throw error;
    }
};

/**
 * Get search trends over a specified time period
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>} Trend analysis data
 */
const getSearchTrends = async (days = 7) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const previousStartDate = new Date();
        previousStartDate.setDate(previousStartDate.getDate() - (days * 2));

        // Current period trends
        const currentTrends = await SearchLog.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$query',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 20
            }
        ]);

        // Previous period trends for comparison
        const previousTrends = await SearchLog.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: previousStartDate,
                        $lt: startDate
                    }
                }
            },
            {
                $group: {
                    _id: '$query',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create a map of previous counts for easy lookup
        const previousCountMap = {};
        previousTrends.forEach(trend => {
            previousCountMap[trend._id] = trend.count;
        });

        // Calculate percentage changes
        const trendsWithChanges = currentTrends.map(trend => {
            const previousCount = previousCountMap[trend._id] || 0;
            const percentageChange = previousCount > 0
                ? ((trend.count - previousCount) / previousCount * 100).toFixed(1)
                : 100; // New search term

            return {
                query: trend._id,
                currentCount: trend.count,
                previousCount,
                percentageChange: parseFloat(percentageChange),
                isNew: previousCount === 0,
                isTrending: percentageChange > 50
            };
        });

        return {
            period: `Last ${days} days`,
            trends: trendsWithChanges,
            totalSearches: currentTrends.reduce((sum, t) => sum + t.count, 0)
        };
    } catch (error) {
        console.error('Error fetching search trends:', error);
        throw error;
    }
};

/**
 * Get search metadata and statistics
 * @returns {Promise<Object>} Metadata including search types and user breakdown
 */
const getSearchMetadata = async () => {
    try {
        const [typeDistribution, userTypeBreakdown, recentSearches] = await Promise.all([
            // Search type distribution
            SearchLog.aggregate([
                {
                    $group: {
                        _id: '$type',
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        type: '$_id',
                        count: 1
                    }
                }
            ]),

            // User type breakdown (guest vs authenticated)
            SearchLog.aggregate([
                {
                    $group: {
                        _id: {
                            $cond: [{ $eq: ['$userId', null] }, 'guest', 'authenticated']
                        },
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        userType: '$_id',
                        count: 1
                    }
                }
            ]),

            // Total count
            SearchLog.countDocuments()
        ]);

        return {
            typeDistribution,
            userTypeBreakdown,
            totalSearches: recentSearches
        };
    } catch (error) {
        console.error('Error fetching search metadata:', error);
        throw error;
    }
};

/**
 * Get comprehensive search log analysis
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Comprehensive search analysis
 */
const getSearchLogAnalysis = async (options = {}) => {
    const { limit = 50, days = 7 } = options;

    try {
        const [topQueries, trends, metadata] = await Promise.all([
            getTopSearchQueries(limit),
            getSearchTrends(days),
            getSearchMetadata()
        ]);

        return {
            topQueries,
            trends,
            metadata,
            generatedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error in comprehensive search log analysis:', error);
        throw error;
    }
};

module.exports = {
    getTopSearchQueries,
    getSearchTrends,
    getSearchMetadata,
    getSearchLogAnalysis
};
