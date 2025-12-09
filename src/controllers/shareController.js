const Event = require('../models/Event');
const mongoose = require('mongoose');
const { detectDevice } = require('../utils/deviceDetection');

const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Get base URL for share links
 * Uses BACKEND_URL if available, otherwise constructs from request
 */
function getBaseUrl(req) {
  // Check for BACKEND_URL environment variable first
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/$/, ''); // Remove trailing slash
  }
  
  // Fallback to constructing from request
  const protocol = req.protocol || 'https';
  const host = req.get('host') || 'mehfil.app';
  return `${protocol}://${host}`;
}

/**
 * @desc    Generate share link for an event
 * @route   GET /api/events/:eventId/share
 * @access  Public
 */
exports.generateShareLink = catchAsync(async (req, res, next) => {
  const { eventId } = req.params;

  // Validate event exists
  const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
  
  let event = null;
  if (isValidObjectId) {
    event = await Event.findById(eventId);
  } else {
    event = await Event.findOne({ slug: eventId });
  }

  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const baseUrl = getBaseUrl(req);
  const shareUrl = `${baseUrl}/share/event/${event._id}`;

  res.status(200).json({
    success: true,
    data: {
      shareUrl,
      eventId: event._id,
      eventName: event.name
    }
  });
});

/**
 * @desc    Handle share link redirect based on device
 * @route   GET /share/event/:eventId
 * @access  Public
 */
exports.handleShareRedirect = catchAsync(async (req, res, next) => {
  const { eventId } = req.params;

  // Validate event exists
  const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
  
  let event = null;
  if (isValidObjectId) {
    event = await Event.findById(eventId);
  } else {
    event = await Event.findOne({ slug: eventId });
  }

  if (!event) {
    // Redirect to 404 page or frontend error page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/404`);
  }

  // Detect device from User-Agent
  const userAgent = req.headers['user-agent'] || '';
  const device = detectDevice(userAgent);

  const baseUrl = getBaseUrl(req);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  // App Store and Play Store URLs (should be set in environment variables)
  const iOS_APP_STORE_ID = process.env.IOS_APP_STORE_ID || '';
  const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.moneebb.mehfilappfrontend';

  // Universal Link and App Link paths
  const universalLink = `${baseUrl}/app/event/${eventId}`;
  const appStoreUrl = iOS_APP_STORE_ID 
    ? `https://apps.apple.com/app/id${iOS_APP_STORE_ID}?pt=event&id=${eventId}`
    : 'https://apps.apple.com'; // Fallback to App Store home if ID not configured
  const playStoreUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}&referrer=event_${eventId}`;
  const webUrl = `${frontendUrl}/event/${eventId}`;

  // Smart redirect based on device
  if (device.isIOS) {
    // Serve HTML page that tries Universal Link, then falls back to App Store
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Opening Event...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="apple-itunes-app" content="app-id=${iOS_APP_STORE_ID || ''}">
        <meta http-equiv="refresh" content="2;url=${appStoreUrl}">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <p>Opening event in app...</p>
        </div>
        <script>
          // Try to open app via Universal Link
          window.location.href = '${universalLink}';
          
          // Fallback to App Store after 2 seconds
          setTimeout(function() {
            window.location.href = '${appStoreUrl}';
          }, 2000);
        </script>
      </body>
      </html>
    `);
  } else if (device.isAndroid) {
    // Serve HTML page that tries App Link, then falls back to Play Store
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Opening Event...</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="2;url=${playStoreUrl}">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <p>Opening event in app...</p>
        </div>
        <script>
          // Try to open app via App Link
          window.location.href = '${universalLink}';
          
          // Fallback to Play Store after 2 seconds
          setTimeout(function() {
            window.location.href = '${playStoreUrl}';
          }, 2000);
        </script>
      </body>
      </html>
    `);
  } else {
    // Web/Desktop - redirect to web version
    return res.redirect(webUrl);
  }
});

