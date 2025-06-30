const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { 
  getCart, 
  addToCart, 
  updateCartItem, 
  removeFromCart 
} = require('../../controllers/cartController');

// All routes in this file are protected and for customers only
router.use(protect, restrictTo('customer'));

router.route('/')
  .get(getCart)
  .post(addToCart);
  
router.route('/:cartItemId')
  .patch(updateCartItem)
  .delete(removeFromCart);

module.exports = router; 