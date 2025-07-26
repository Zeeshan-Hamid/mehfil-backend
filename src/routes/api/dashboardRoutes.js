const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { getDashboardStats } = require('../../controllers/dashboardController');

// All routes in this file are protected and restricted to vendors
router.use(protect, restrictTo('vendor'));

// GET /api/dashboard/stats - Get dashboard statistics for the logged-in vendor
router.get('/stats', getDashboardStats);

module.exports = router; 