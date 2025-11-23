const express = require('express');
const router = express.Router();
const leadGenerationController = require('../../controllers/leadGenerationController');

// Public route - create a new lead
router.post('/leads', leadGenerationController.createLead);

// Admin routes - get and update leads
router.get('/leads', leadGenerationController.getAllLeads);
router.patch('/leads/:id', leadGenerationController.updateLeadStatus);

module.exports = router;
