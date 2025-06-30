const User = require('../models/User');
const Event = require('../models/Event');

// @desc    Search for vendors by business name
// @route   GET /api/search/vendors
// @access  Public
const searchVendors = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query (q) is required.'
            });
        }

        // Using regex for a case-insensitive partial match on businessName
        // An index on vendorProfile.businessName will make this efficient
        const vendors = await User.find({
            role: 'vendor',
            'vendorProfile.businessName': { $regex: q, $options: 'i' }
        }).select('vendorProfile.businessName vendorProfile.ownerName vendorProfile.businessAddress vendorProfile.rating.average vendorProfile.rating.totalReviews'); // Select fields for a lean response

        res.status(200).json({
            success: true,
            message: `Found ${vendors.length} vendors matching your search.`,
            data: {
                count: vendors.length,
                vendors
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
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query (q) is required.'
            });
        }
        
        // Using MongoDB's text search capabilities.
        // A text index must be created on the Event schema for this to work.
        // The index will include name, location fields, and tags.
        // Results are automatically scored and sorted by relevance.
        const listings = await Event.find(
            { $text: { $search: q } },
            { score: { $meta: "textScore" } }
        )
        .sort({ score: { $meta: "textScore" } })
        .populate({
            path: 'vendor',
            select: 'vendorProfile.businessName vendorProfile.ownerName' // Populate with lean vendor info
        });

        res.status(200).json({
            success: true,
            message: `Found ${listings.length} listings matching your search.`,
            data: {
                count: listings.length,
                listings
            }
        });

    } catch (error) {
        console.error('Listing search error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during listing search.'
        });
    }
};


module.exports = {
    searchVendors,
    searchListings
}; 