const express = require('express');
const router = express.Router();
const contactUsController = require('../../controllers/contactUsController');
const { validateContactForm, validateStatusUpdate, validateResponse } = require('../../validators/contactUsValidators');
const { protect, restrictTo } = require('../../middleware/authMiddleware');

// Public routes
router.post('/submit', validateContactForm, contactUsController.submitContactForm);

// Protected routes (Admin only)
router.use(protect);
router.use(restrictTo('admin'));

// Admin routes for managing contact submissions
router.get('/submissions', contactUsController.getAllSubmissions);
router.get('/submissions/:id', contactUsController.getSubmission);
router.patch('/submissions/:id/status', validateStatusUpdate, contactUsController.updateSubmissionStatus);
router.post('/submissions/:id/respond', validateResponse, contactUsController.respondToSubmission);
router.delete('/submissions/:id', contactUsController.deleteSubmission);

// Statistics route
router.get('/stats', contactUsController.getContactStats);

module.exports = router; 