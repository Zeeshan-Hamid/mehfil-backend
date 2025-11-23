const express = require('express');
const router = express.Router();
const { searchVendors, searchListings, logSearchEvent } = require('../../controllers/searchController');

// @route   GET /api/search/vendors
// @desc    Search for vendors
// @access  Public
router.get('/vendors', searchVendors);

// @route   GET /api/search/listings
// @desc    Search for listings (events)
// @access  Public
router.get('/listings', searchListings);

// @route   POST /api/search/log
// @desc    Log a search event (e.g. suggestion click)
// @access  Public
router.post('/log', logSearchEvent);

module.exports = router;
//yes