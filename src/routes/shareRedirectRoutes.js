const express = require('express');
const router = express.Router();
const { handleShareRedirect } = require('../controllers/shareController');

// Smart redirect for shared events/listings
router.get('/event/:eventId', handleShareRedirect);
router.get('/listing/:eventId', handleShareRedirect); // alias for listing wording

module.exports = router;

