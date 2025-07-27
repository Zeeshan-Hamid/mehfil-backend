const ContactUs = require('../models/ContactUs');
const { validationResult } = require('express-validator');

// Enhanced error handler with logging
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Helper function for logging
const logContactActivity = (action, details) => {
  const timestamp = new Date().toISOString();
  console.log(`[ContactUs] ${timestamp} - ${action}:`, details);
};

// @desc    Submit contact form
// @route   POST /api/contact-us/submit
// @access  Public
exports.submitContactForm = catchAsync(async (req, res) => {
  logContactActivity('Contact form submission attempt', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body
  });

  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logContactActivity('Validation failed', { errors: errors.array() });
    return res.status(400).json({
      status: 'fail',
      message: 'Validation error',
      errors: errors.array()
    });
  }

  const { name, email, message, subject } = req.body;

  try {
    // Create new contact submission
    const contactSubmission = new ContactUs({
      name,
      email,
      message,
      subject: subject || 'General Inquiry',
      source: 'website',
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      tags: ['website-submission']
    });

    await contactSubmission.save();

    logContactActivity('Contact form submitted successfully', {
      id: contactSubmission._id,
      email: contactSubmission.email,
      name: contactSubmission.name
    });

    res.status(201).json({
      status: 'success',
      message: 'Thank you for your message! We will get back to you soon.',
      data: {
        id: contactSubmission._id,
        submittedAt: contactSubmission.createdAt
      }
    });

  } catch (error) {
    logContactActivity('Database error during submission', {
      error: error.message,
      email: email
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit contact form. Please try again later.'
    });
  }
});

// @desc    Get all contact submissions (Admin only)
// @route   GET /api/contact-us/submissions
// @access  Private (Admin)
exports.getAllSubmissions = catchAsync(async (req, res) => {
  logContactActivity('Admin requesting all submissions', {
    adminId: req.user?.id,
    query: req.query
  });

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.email) filter.email = { $regex: req.query.email, $options: 'i' };

  // Build sort
  const sort = {};
  if (req.query.sortBy) {
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
    sort[req.query.sortBy] = sortOrder;
  } else {
    sort.createdAt = -1; // Default sort by newest first
  }

  const submissions = await ContactUs.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate('assignedTo', 'name email');

  const total = await ContactUs.countDocuments(filter);

  logContactActivity('Submissions retrieved', {
    count: submissions.length,
    total,
    page,
    limit
  });

  res.status(200).json({
    status: 'success',
    data: {
      submissions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    }
  });
});

// @desc    Get single contact submission
// @route   GET /api/contact-us/submissions/:id
// @access  Private (Admin)
exports.getSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;

  logContactActivity('Admin requesting single submission', {
    adminId: req.user?.id,
    submissionId: id
  });

  const submission = await ContactUs.findById(id)
    .populate('assignedTo', 'name email');

  if (!submission) {
    logContactActivity('Submission not found', { submissionId: id });
    return res.status(404).json({
      status: 'fail',
      message: 'Contact submission not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      submission
    }
  });
});

// @desc    Update contact submission status
// @route   PATCH /api/contact-us/submissions/:id/status
// @access  Private (Admin)
exports.updateSubmissionStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, notes, assignedTo } = req.body;

  logContactActivity('Admin updating submission status', {
    adminId: req.user?.id,
    submissionId: id,
    newStatus: status
  });

  const submission = await ContactUs.findById(id);

  if (!submission) {
    return res.status(404).json({
      status: 'fail',
      message: 'Contact submission not found'
    });
  }

  // Update fields
  if (status) submission.status = status;
  if (notes) submission.notes = notes;
  if (assignedTo) submission.assignedTo = assignedTo;

  await submission.save();

  logContactActivity('Submission status updated', {
    submissionId: id,
    newStatus: submission.status
  });

  res.status(200).json({
    status: 'success',
    message: 'Submission status updated successfully',
    data: {
      submission
    }
  });
});

// @desc    Respond to contact submission
// @route   POST /api/contact-us/submissions/:id/respond
// @access  Private (Admin)
exports.respondToSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { responseMessage } = req.body;

  logContactActivity('Admin responding to submission', {
    adminId: req.user?.id,
    submissionId: id
  });

  const submission = await ContactUs.findById(id);

  if (!submission) {
    return res.status(404).json({
      status: 'fail',
      message: 'Contact submission not found'
    });
  }

  await submission.markAsResponded(responseMessage);

  logContactActivity('Response sent to submission', {
    submissionId: id,
    responseDate: submission.responseDate
  });

  res.status(200).json({
    status: 'success',
    message: 'Response sent successfully',
    data: {
      submission
    }
  });
});

// @desc    Get contact form statistics
// @route   GET /api/contact-us/stats
// @access  Private (Admin)
exports.getContactStats = catchAsync(async (req, res) => {
  logContactActivity('Admin requesting contact stats', {
    adminId: req.user?.id
  });

  const stats = await ContactUs.getStats();

  // Get recent submissions count (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentSubmissions = await ContactUs.countDocuments({
    createdAt: { $gte: sevenDaysAgo }
  });

  const enhancedStats = {
    ...stats,
    recentSubmissions
  };

  logContactActivity('Contact stats retrieved', enhancedStats);

  res.status(200).json({
    status: 'success',
    data: {
      stats: enhancedStats
    }
  });
});

// @desc    Delete contact submission
// @route   DELETE /api/contact-us/submissions/:id
// @access  Private (Admin)
exports.deleteSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;

  logContactActivity('Admin deleting submission', {
    adminId: req.user?.id,
    submissionId: id
  });

  const submission = await ContactUs.findByIdAndDelete(id);

  if (!submission) {
    return res.status(404).json({
      status: 'fail',
      message: 'Contact submission not found'
    });
  }

  logContactActivity('Submission deleted', {
    submissionId: id,
    email: submission.email
  });

  res.status(204).json({
    status: 'success',
    message: 'Contact submission deleted successfully'
  });
});

module.exports = {
  submitContactForm: exports.submitContactForm,
  getAllSubmissions: exports.getAllSubmissions,
  getSubmission: exports.getSubmission,
  updateSubmissionStatus: exports.updateSubmissionStatus,
  respondToSubmission: exports.respondToSubmission,
  getContactStats: exports.getContactStats,
  deleteSubmission: exports.deleteSubmission
}; 