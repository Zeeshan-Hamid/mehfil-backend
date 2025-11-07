const DemoRequest = require('../models/DemoRequest');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

/**
 * Submit a demo request
 * POST /api/demo-request
 */
exports.submitDemoRequest = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      businessName
    } = req.body;

    // Validation
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Create demo request
    const demoRequest = new DemoRequest({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      businessName: businessName?.trim() || ''
    });

    await demoRequest.save();

    logger.info(
      {
        event: 'demo_request_submitted',
        demoRequestId: demoRequest._id,
        email: demoRequest.email,
        businessName: demoRequest.businessName || 'Not provided'
      },
      'Demo request submitted successfully'
    );

    res.status(201).json({
      success: true,
      message: 'Demo request submitted successfully. We\'ll get back to you soon!',
      data: {
        id: demoRequest._id,
        submittedAt: demoRequest.submittedAt
      }
    });

  } catch (error) {
    logger.error(
      {
        event: 'demo_request_submission_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack
        }
      },
      'Error submitting demo request'
    );

    // Handle duplicate email error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A demo request with this email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit demo request. Please try again later.'
    });
  }
};

/**
 * Get all demo requests (Admin only - for future use)
 * GET /api/demo-request
 */
exports.getDemoRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const demoRequests = await DemoRequest.find(query)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    const total = await DemoRequest.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        demoRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error(
      {
        event: 'get_demo_requests_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error'
        }
      },
      'Error fetching demo requests'
    );

    res.status(500).json({
      success: false,
      message: 'Failed to fetch demo requests'
    });
  }
};

