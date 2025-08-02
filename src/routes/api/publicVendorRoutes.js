const express = require('express');
const router = express.Router();
const { getVendorProfile } = require('../../controllers/vendorController');

// GET /api/public-vendor/:id - Fetches a vendor's public profile
router.get('/:id', getVendorProfile);

module.exports = router;
