/**
 * Device Detection Utility
 * Detects the user's device type from User-Agent string for share link redirects
 */

/**
 * Detects device type from User-Agent string
 * @param {string} userAgent - The User-Agent header from the request
 * @returns {Object} Device detection object with platform information
 */
function detectDevice(userAgent) {
  const ua = userAgent || '';

  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid;

  return {
    isIOS,
    isAndroid,
    isMobile,
    isWeb: !isMobile
  };
}

module.exports = {
  detectDevice
};

