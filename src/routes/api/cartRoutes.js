const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { 
  getCart, 
  getCartCount,
  addToCart, 
  updateCartItem, 
  removeFromCart 
} = require('../../controllers/cartController');

// All routes in this file are protected and for customers only
router.use(protect, restrictTo('customer'));

router.route('/')
  .get(getCart)
  .post(addToCart);

router.route('/count')
  .get(getCartCount);
  
router.route('/:cartItemId')
  .patch(updateCartItem)
  .delete(removeFromCart);

module.exports = router; 