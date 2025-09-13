const slugify = require('slugify');

/**
 * Generate a slug from event data (for consistency with schema method)
 */
function generateEventSlug(eventName, businessName, city, state, eventId) {
  // Create base slug: business-name-city-state
  let baseSlug = '';
  
  if (businessName) {
    baseSlug += slugify(businessName, { lower: true, strict: true });
  }
  if (city) {
    baseSlug += baseSlug ? '-' + slugify(city, { lower: true, strict: true }) : slugify(city, { lower: true, strict: true });
  }
  if (state) {
    baseSlug += baseSlug ? '-' + slugify(state, { lower: true, strict: true }) : slugify(state, { lower: true, strict: true });
  }
  
  // If we still don't have a base slug, use the event name
  if (!baseSlug) {
    baseSlug = slugify(eventName, { lower: true, strict: true });
  }
  
  // Add part of ObjectId for uniqueness (last 8 characters)
  const idSuffix = eventId ? eventId.toString().slice(-8) : '';
  return baseSlug + (idSuffix ? '-' + idSuffix : '');
}

/**
 * Get the best identifier for an event (slug if available, otherwise ID)
 */
function getEventIdentifier(event) {
  return event.slug || event._id || event.id;
}

/**
 * Check if a string is a valid ObjectId
 */
function isValidObjectId(str) {
  const mongoose = require('mongoose');
  return mongoose.Types.ObjectId.isValid(str);
}

/**
 * Determine if an identifier is a slug or an ObjectId
 */
function isSlug(identifier) {
  return !isValidObjectId(identifier);
}

module.exports = {
  generateEventSlug,
  getEventIdentifier,
  isValidObjectId,
  isSlug
};


