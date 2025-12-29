/**
 * Platform Detection Middleware
 * Detects whether the request is coming from web or mobile app
 */

const detectPlatform = (req, res, next) => {
  // Initialize platform detection
  req.platform = {
    type: 'web', // default
    isMobile: false,
    isWeb: true,
    userAgent: req.get('User-Agent') || '',
    customHeaders: {}
  };

  // Check if platform detection is enabled
  if (process.env.ENABLE_PLATFORM_DETECTION !== 'true') {
    return next();
  }

  // Method 1: Check for custom platform header (most reliable for mobile apps)
  const platformHeader = req.get('X-Platform') || req.get('x-platform');
  if (platformHeader) {
    req.platform.type = platformHeader.toLowerCase();
    req.platform.isMobile = ['mobile', 'ios', 'android', 'react-native'].includes(req.platform.type);
    req.platform.isWeb = !req.platform.isMobile;
    req.platform.customHeaders.platform = platformHeader;
    return next();
  }

  // Method 1.5: Check for iOS-specific headers
  const iosHeaders = [
    'X-iOS-Version',
    'X-Device-Model',
    'X-App-Version',
    'X-React-Native'
  ];

  for (const header of iosHeaders) {
    const value = req.get(header) || req.get(header.toLowerCase());
    if (value) {
      req.platform.type = 'ios';
      req.platform.isMobile = true;
      req.platform.isWeb = false;
      req.platform.customHeaders[header] = value;
      return next();
    }
  }

  // Method 2: Check for mobile-specific headers
  const mobileHeaders = [
    'X-React-Native',
    'X-Mobile-App',
    'X-App-Version',
    'X-Device-Type'
  ];

  for (const header of mobileHeaders) {
    const value = req.get(header) || req.get(header.toLowerCase());
    if (value) {
      req.platform.type = 'mobile';
      req.platform.isMobile = true;
      req.platform.isWeb = false;
      req.platform.customHeaders[header] = value;
      return next();
    }
  }

  // Method 3: User-Agent analysis (fallback)
  const userAgent = req.platform.userAgent.toLowerCase();
  
  // Mobile app user agents (common patterns)
  const mobilePatterns = [
    'react-native',
    'expo',
    'mehfilapp',
    'okhttp', // Android HTTP client
    'cfnetwork', // iOS HTTP client
    'alamofire', // iOS HTTP client
    'ios', // iOS specific
    'iphone',
    'ipad'
  ];

  for (const pattern of mobilePatterns) {
    if (userAgent.includes(pattern)) {
      req.platform.type = 'mobile';
      req.platform.isMobile = true;
      req.platform.isWeb = false;
      break;
    }
  }

  // Method 4: Check for mobile-specific query parameters
  const mobileParams = ['mobile', 'app', 'platform'];
  for (const param of mobileParams) {
    if (req.query[param] && ['mobile', 'ios', 'android', 'react-native'].includes(req.query[param].toLowerCase())) {
      req.platform.type = req.query[param].toLowerCase();
      req.platform.isMobile = true;
      req.platform.isWeb = false;
      break;
    }
  }

  // Log platform detection for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 Platform Detection:', {
      detected: req.platform.type,
      isMobile: req.platform.isMobile,
      isWeb: req.platform.isWeb,
      userAgent: req.platform.userAgent.substring(0, 100),
      customHeaders: req.platform.customHeaders,
      queryParams: Object.keys(req.query).length > 0 ? req.query : 'none'
    });
  }

  next();
};

module.exports = detectPlatform;
