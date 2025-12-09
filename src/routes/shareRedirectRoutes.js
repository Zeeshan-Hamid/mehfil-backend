const express = require('express');
const router = express.Router();
const { handleShareRedirect, handleAppLinkLanding } = require('../controllers/shareController');

// Smart redirect for shared events/listings
router.get('/event/:eventId', handleShareRedirect);
router.get('/listing/:eventId', handleShareRedirect); // alias for listing wording

// Universal/App Link landing (prevent 404 JSON when opened in browser)
router.get('/app/event/:eventId', handleAppLinkLanding);

module.exports = router;

