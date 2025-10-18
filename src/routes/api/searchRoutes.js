const express = require('express');
const router = express.Router();
const { searchVendors, searchListings } = require('../../controllers/searchController');

// @route   GET /api/search/vendors
// @desc    Search for vendors
// @access  Public
router.get('/vendors', searchVendors);

// @route   GET /api/search/listings
// @desc    Search for listings (events)
// @access  Public
router.get('/listings', searchListings);

module.exports = router; 
//yes