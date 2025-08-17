const zipcodes = require('zipcodes');

// State abbreviation to full name mapping
const STATE_ABBREVIATIONS = {
  "AL": "Alabama",
  "AK": "Alaska",
  "AZ": "Arizona",
  "AR": "Arkansas",
  "CA": "California",
  "CO": "Colorado",
  "CT": "Connecticut",
  "DE": "Delaware",
  "DC": "District_of_Columbia",
  "FL": "Florida",
  "GA": "Georgia",
  "HI": "Hawaii",
  "ID": "Idaho",
  "IL": "Illinois",
  "IN": "Indiana",
  "IA": "Iowa",
  "KS": "Kansas",
  "KY": "Kentucky",
  "LA": "Louisiana",
  "ME": "Maine",
  "MD": "Maryland",
  "MA": "Massachusetts",
  "MI": "Michigan",
  "MN": "Minnesota",
  "MS": "Mississippi",
  "MO": "Missouri",
  "MT": "Montana",
  "NE": "Nebraska",
  "NV": "Nevada",
  "NH": "New_Hampshire",
  "NJ": "New_Jersey",
  "NM": "New_Mexico",
  "NY": "New_York",
  "NC": "North_Carolina",
  "ND": "North_Dakota",
  "OH": "Ohio",
  "OK": "Oklahoma",
  "OR": "Oregon",
  "PA": "Pennsylvania",
  "PR": "Puerto_Rico",
  "RI": "Rhode_Island",
  "SC": "South_Carolina",
  "SD": "South_Dakota",
  "TN": "Tennessee",
  "TX": "Texas",
  "UT": "Utah",
  "VT": "Vermont",
  "VA": "Virginia",
  "WA": "Washington",
  "WV": "West_Virginia",
  "WI": "Wisconsin",
  "WY": "Wyoming"
};

// Tax rates for all US states (as provided)
const STATE_TAX_RATES = {
  "Alabama": 9.29,
  "Alaska": 1.82,
  "Arizona": 8.38,
  "Arkansas": 9.45,
  "California": 8.85,
  "Colorado": 7.81,
  "Connecticut": 6.35,
  "Delaware": 0.00,
  "District_of_Columbia": 6.00,
  "Florida": 7.00,
  "Georgia": 7.38,
  "Hawaii": 4.50,
  "Idaho": 6.03,
  "Illinois": 8.86,
  "Indiana": 7.00,
  "Iowa": 6.94,
  "Kansas": 8.65,
  "Kentucky": 6.00,
  "Louisiana": 9.56,
  "Maine": 5.50,
  "Maryland": 6.00,
  "Massachusetts": 6.25,
  "Michigan": 6.00,
  "Minnesota": 8.04,
  "Mississippi": 7.06,
  "Missouri": 8.39,
  "Montana": 0.00,
  "Nebraska": 6.97,
  "Nevada": 8.24,
  "New_Hampshire": 0.00,
  "New_Jersey": 6.63,
  "New_Mexico": 7.62,
  "New_York": 8.53,
  "North_Carolina": 7.00,
  "North_Dakota": 7.04,
  "Ohio": 7.24,
  "Oklahoma": 8.99,
  "Oregon": 0.00,
  "Pennsylvania": 6.34,
  "Puerto_Rico": 11.50,
  "Rhode_Island": 7.00,
  "South_Carolina": 7.50,
  "South_Dakota": 6.11,
  "Tennessee": 9.55,
  "Texas": 8.20,
  "Utah": 7.25,
  "Vermont": 6.36,
  "Virginia": 5.77,
  "Washington": 9.38,
  "West_Virginia": 6.57,
  "Wisconsin": 5.70,
  "Wyoming": 5.44
};

/**
 * Get state and tax rate from zip code
 * @param {string} zipCode - The zip code to look up
 * @returns {object} Object containing state and tax rate
 */
function getTaxInfoFromZipCode(zipCode) {
  if (!zipCode) {
    return { state: null, taxRate: 0, error: 'Zip code is required' };
  }

  // Clean zip code (remove spaces, dashes, etc.)
  const cleanZipCode = zipCode.toString().replace(/[^0-9]/g, '');
  
  if (cleanZipCode.length !== 5) {
    return { state: null, taxRate: 0, error: 'Invalid zip code format' };
  }

  // Look up zip code information
  const zipInfo = zipcodes.lookup(cleanZipCode);
  
  if (!zipInfo) {
    return { state: null, taxRate: 0, error: 'Zip code not found' };
  }

  const stateAbbr = zipInfo.state;
  const stateFullName = STATE_ABBREVIATIONS[stateAbbr];
  const taxRate = stateFullName ? STATE_TAX_RATES[stateFullName] || 0 : 0;

  return {
    state: stateFullName,
    stateAbbr: stateAbbr,
    taxRate,
    city: zipInfo.city,
    error: null
  };
}

/**
 * Calculate tax amount based on subtotal and tax rate
 * @param {number} subtotal - The subtotal amount
 * @param {number} taxRate - The tax rate percentage
 * @returns {number} The calculated tax amount
 */
function calculateTaxAmount(subtotal, taxRate) {
  if (typeof subtotal !== 'number' || subtotal < 0) {
    return 0;
  }
  
  if (typeof taxRate !== 'number' || taxRate < 0) {
    return 0;
  }

  return Math.round((subtotal * (taxRate / 100)) * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate total with tax
 * @param {number} subtotal - The subtotal amount
 * @param {number} taxRate - The tax rate percentage
 * @returns {number} The total amount including tax
 */
function calculateTotalWithTax(subtotal, taxRate) {
  const taxAmount = calculateTaxAmount(subtotal, taxRate);
  return Math.round((subtotal + taxAmount) * 100) / 100; // Round to 2 decimal places
}

module.exports = {
  getTaxInfoFromZipCode,
  calculateTaxAmount,
  calculateTotalWithTax,
  STATE_TAX_RATES
};
