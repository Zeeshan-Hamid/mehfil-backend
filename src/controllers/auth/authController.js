const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// @desc    Register a new customer
// @route   POST /api/auth/signup/customer
// @access  Public
const signupCustomer = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      fullName,
      email,
      password,
      phoneNumber,
      city,
      state,
      country,
      zipCode,
      gender
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new customer
    const newCustomer = new User({
      email,
      password,
      phoneNumber,
      role: 'customer',
      customerProfile: {
        fullName,
        gender,
        location: {
          city,
          state,
          country: country || 'United States',
          zipCode
        }
      }
    });

    // Save customer to database
    await newCustomer.save();

    // Generate JWT token
    const token = generateToken(newCustomer._id);

    // Remove password and unwanted profiles from response
    const customerResponse = newCustomer.toObject();
    delete customerResponse.password;
    delete customerResponse.vendorProfile; // Remove vendor profile for customers

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      data: {
        user: customerResponse,
        token
      }
    });

  } catch (error) {
    console.error('Customer signup error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during customer registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Register a new vendor
// @route   POST /api/auth/signup/vendor
// @access  Public
const signupVendor = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      businessName,
      ownerName,
      email,
      password,
      phoneNumber,
      street,
      city,
      state,
      country,
      zipCode,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new vendor
    const newVendor = new User({
      email,
      password,
      phoneNumber,
      role: 'vendor',
      vendorProfile: {
        businessName,
        ownerName,
        businessAddress: {
          street,
          city,
          state,
          country: country || 'United States',
          zipCode
        },
        // Set default values for required fields - we'll set these as temporary values
        serviceDescription: 'Service description to be updated during profile setup',
        experienceYears: 0,
        serviceAreas: [city],
        pricing: {
          startingPrice: 0,
          currency: 'USD',
          pricingType: 'custom'
        }
      }
    });

    // Save vendor to database
    await newVendor.save();

    // Generate JWT token
    const token = generateToken(newVendor._id);

    // Remove password and unwanted profiles from response
    const vendorResponse = newVendor.toObject();
    delete vendorResponse.password;
    delete vendorResponse.customerProfile; // Remove customer profile for vendors

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully. Profile pending approval.',
      data: {
        user: vendorResponse,
        token
      }
    });

  } catch (error) {
    console.error('Vendor signup error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during vendor registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Login user (customer/vendor/admin)
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Remove password and unwanted profiles from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    // Remove unwanted profile based on role
    if (user.role === 'customer') {
      delete userResponse.vendorProfile;
    } else if (user.role === 'vendor') {
      delete userResponse.customerProfile;
    }

    res.status(200).json({
      success: true,
      message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} logged in successfully`,
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  signupCustomer,
  signupVendor,
  login
}; 