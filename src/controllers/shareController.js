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
  
  // Use slug if available, otherwise use ID
  // Frontend route pattern can be configured via FRONTEND_EVENT_ROUTE (default: /events/)
  const eventRoute = process.env.FRONTEND_EVENT_ROUTE || '/vendor_listing_details';
  const eventIdentifier = event.slug || eventId;
  const webUrl = `${frontendUrl}${eventRoute.replace(/\/$/, '')}/${eventIdentifier}`;

  // Smart redirect based on device
  if (device.isMobile) {
    // For mobile (iOS/Android), redirect to Universal Link path
    // Universal Links/App Links will handle opening the app
    // If app not installed, /app/event/:id will serve a fallback page
    return res.redirect(universalLink);
  } else {
    // Web/Desktop - redirect to web version
    return res.redirect(webUrl);
  }
});

/**
 * @desc    Universal/App Link landing for /app/event/:eventId
 *          Serves a simple HTML page that lets Universal Links work.
 *          If app is installed, iOS/Android will intercept and open the app.
 *          If app is not installed, shows a download page with store links.
 * @route   GET /app/event/:eventId
 * @access  Public
 */
exports.handleAppLinkLanding = catchAsync(async (req, res, next) => {
  const { eventId } = req.params;

  // Validate event exists (ID or slug)
  const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
  let event = null;
  if (isValidObjectId) {
    event = await Event.findById(eventId);
  } else {
    event = await Event.findOne({ slug: eventId });
  }

  if (!event) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/404`);
  }

  // Detect device
  const userAgent = req.headers['user-agent'] || '';
  const device = detectDevice(userAgent);
  
  const baseUrl = getBaseUrl(req);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const iOS_APP_STORE_ID = process.env.IOS_APP_STORE_ID || '';
  const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.moneebb.mehfilappfrontend';
  
  // Use slug if available, otherwise use ID
  const eventRoute = process.env.FRONTEND_EVENT_ROUTE || '/vendor_listing_details';
  const eventIdentifier = event.slug || eventId;
  const webUrl = `${frontendUrl}${eventRoute.replace(/\/$/, '')}/${eventIdentifier}`;
  
  const appStoreUrl = iOS_APP_STORE_ID 
    ? `https://apps.apple.com/app/id${iOS_APP_STORE_ID}?pt=event&id=${eventId}`
    : 'https://apps.apple.com';
  const playStoreUrl = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}&referrer=event_${eventId}`;

  // Serve HTML page - Universal Links will intercept if app is installed
  // If not installed, show download options
  if (device.isIOS) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${event.name} - Mehfil</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="apple-itunes-app" content="app-id=${iOS_APP_STORE_ID || ''}">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
          }
          .container {
            max-width: 400px;
          }
          h1 {
            margin: 0 0 1rem 0;
            font-size: 1.5rem;
          }
          p {
            margin: 0.5rem 0;
            opacity: 0.9;
          }
          .button {
            display: inline-block;
            margin: 1rem 0.5rem;
            padding: 0.75rem 1.5rem;
            background: white;
            color: #667eea;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          }
          .button:hover {
            opacity: 0.9;
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
          <h1>Opening in app...</h1>
          <p>If the app doesn't open, download it from the App Store.</p>
          <a href="${appStoreUrl}" class="button">Download App</a>
          <a href="${webUrl}" class="button">View on Web</a>
        </div>
        <script>
          // Universal Link will be intercepted by iOS if app is installed
          // This page is only shown if app is not installed
        </script>
      </body>
      </html>
    `);
  } else if (device.isAndroid) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${event.name} - Mehfil</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
          }
          .container {
            max-width: 400px;
          }
          h1 {
            margin: 0 0 1rem 0;
            font-size: 1.5rem;
          }
          p {
            margin: 0.5rem 0;
            opacity: 0.9;
          }
          .button {
            display: inline-block;
            margin: 1rem 0.5rem;
            padding: 0.75rem 1.5rem;
            background: white;
            color: #667eea;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          }
          .button:hover {
            opacity: 0.9;
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
          <h1>Opening in app...</h1>
          <p>If the app doesn't open, download it from the Play Store.</p>
          <a href="${playStoreUrl}" class="button">Download App</a>
          <a href="${webUrl}" class="button">View on Web</a>
        </div>
        <script>
          // App Link will be intercepted by Android if app is installed
          // This page is only shown if app is not installed
        </script>
      </body>
      </html>
    `);
  } else {
    // Desktop/web - redirect to web version
    return res.redirect(webUrl);
  }
});

/**
 * @desc    Serve Apple App Site Association file for Universal Links
 * @route   GET /.well-known/apple-app-site-association
 * @access  Public
 */
exports.serveAppleAppSiteAssociation = (req, res) => {
  const IOS_APP_ID = process.env.IOS_APP_ID || 'TEAM_ID.com.moneebb.mehfilapp';
  
  // Split the app ID to get team ID and bundle ID
  const parts = IOS_APP_ID.split('.');
  const teamId = parts[0];
  const bundleId = parts.slice(1).join('.');

  const association = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${teamId}.${bundleId}`,
          paths: [
            "/app/event/*",
            "/app/listing/*",
            "/share/event/*",
            "/share/listing/*"
          ]
        }
      ]
    }
  };

  res.setHeader('Content-Type', 'application/json');
  res.json(association);
};
