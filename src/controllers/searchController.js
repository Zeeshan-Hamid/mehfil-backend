const User = require('../models/User');
const Event = require('../models/Event');

// @desc    Search for vendors by business name
// @route   GET /api/search/vendors
// @access  Public
const searchVendors = async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query (q) is required.'
            });
        }

        // Using regex for a case-insensitive partial match on businessName
        // This will match partial words as well
        const vendors = await User.find({
            role: 'vendor',
            'vendorProfile.businessName': { $regex: q, $options: 'i' }
        })
        .select('vendorProfile.businessName vendorProfile.ownerName vendorProfile.businessAddress vendorProfile.rating vendorProfile.primaryServiceCategory')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

        // Get total count for pagination info
        const totalCount = await User.countDocuments({
            role: 'vendor',
            'vendorProfile.businessName': { $regex: q, $options: 'i' }
        });

        res.status(200).json({
            success: true,
            message: `Found ${totalCount} vendors matching your search.`,
            data: {
                vendors,
                pagination: {
                    total: totalCount,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(totalCount / limitNum)
                }
            }
        });

    } catch (error) {
        console.error('Vendor search error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during vendor search.'
        });
    }
};

// @desc    Search for listings (events) by name, location, tags
// @route   GET /api/search/listings
// @access  Public
const searchListings = async (req, res) => {
    try {
        const { q, page = 1, limit = 12 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query (q) is required.'
            });
        }
        
        // Instead of combining text search with regex in an $or, we'll:
        // 1. Try text search first (which is more efficient)
        // 2. If not enough results, then try regex search
        
        // Create a regex pattern for the search term
        const searchRegex = new RegExp(q, 'i');
        
        // First attempt: Use text search which is fast and uses the text index
        let listings = await Event.find(
            { $text: { $search: q } },
            { score: { $meta: 'textScore' } }
        )
        .select('name category description imageUrls location averageRating totalReviews tags')
        .sort({ score: { $meta: 'textScore' }, averageRating: -1, createdAt: -1 })
        .populate({
            path: 'vendor',
            select: 'vendorProfile.businessName vendorProfile.rating'
        })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
        
        // Get total count for text search
        let totalCount = await Event.countDocuments({ $text: { $search: q } });
        
        // If text search didn't return enough results, try regex search
        // This handles partial word matches better
        if (listings.length < limitNum) {
            // Calculate how many more items we need
            const remainingItems = limitNum - listings.length;
            
            // Use regex search on individual fields (avoiding the $or with $text issue)
            const regexListings = await Event.find({
                $or: [
                    { name: searchRegex },
                    { 'location.city': searchRegex },
                    { 'location.state': searchRegex },
                    { 'location.zipCode': searchRegex },
                    { tags: searchRegex }
                ],
                // Exclude items already found by text search
                _id: { $nin: listings.map(l => l._id) }
            })
            .select('name category description imageUrls location averageRating totalReviews tags')
            .sort({ averageRating: -1, createdAt: -1 })
            .populate({
                path: 'vendor',
                select: 'vendorProfile.businessName vendorProfile.rating'
            })
            .limit(remainingItems);
            
            // Add regex search results to the listings array
            listings = [...listings, ...regexListings];
            
            // Update total count to include regex matches
            const regexCount = await Event.countDocuments({
                $or: [
                    { name: searchRegex },
                    { 'location.city': searchRegex },
                    { 'location.state': searchRegex },
                    { 'location.zipCode': searchRegex },
                    { tags: searchRegex }
                ],
                _id: { $nin: listings.map(l => l._id) }
            });
            
            totalCount += regexCount;
        }

        res.status(200).json({
            success: true,
            message: `Found ${totalCount} listings matching your search.`,
            data: {
                listings,
                pagination: {
                    total: totalCount,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(totalCount / limitNum)
                }
            }
        });

    } catch (error) {
        console.error('Listing search error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during listing search.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    searchVendors,
    searchListings
}; 