const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');

// @desc    Get cart count
// @route   GET /api/cart/count
// @access  Private (Customers only)
exports.getCartCount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const cartCount = user.customerProfile.customerCart.length;

    res.status(200).json({
      success: true,
      data: {
        count: cartCount
      }
    });
  } catch (error) {
    console.error('Get cart count error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get the customer's cart
// @route   GET /api/cart
// @access  Private (Customers only)
exports.getCart = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'customerProfile.customerCart.event',
      select: 'name imageUrls packages customPackages location flatPrice'
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Manually construct a detailed cart response
    const detailedCart = user.customerProfile.customerCart.map(item => {
      if (!item.event) {
        // This can happen if an event was deleted but still exists in a cart
        return {
          _id: item._id,
          event: null, // Indicate that the event is no longer available
          package: null,
          packageType: item.packageType,
          error: 'Event no longer exists.'
        };
      }
      
      let eventPackage;
      if (item.packageType === 'flatPrice') {
        // For flat price items, create a package object from flat price data
        eventPackage = {
          name: 'Flat Price',
          price: item.event.flatPrice?.amount || 0,
          description: item.event.flatPrice?.description || 'Standard pricing'
        };
      } else if (item.packageType === 'regular') {
        eventPackage = item.event.packages?.id?.(item.package) || null;
      } else {
        // For custom packages, find the specific custom package
        const customPackages = item.event.customPackages || [];
        eventPackage = customPackages.find(pkg => pkg._id.toString() === item.package.toString()) || null;
      }
      
      return {
        _id: item._id,
        event: {
          _id: item.event._id,
          name: item.event.name,
          imageUrl: Array.isArray(item.event.imageUrls) && item.event.imageUrls.length > 0 ? item.event.imageUrls[0] : null,
          location: item.event.location || {}
        },
        package: eventPackage || { name: 'Package not found' },
        packageType: item.packageType,
        eventDate: item.eventDate,
        eventTime: item.eventTime,
        attendees: item.attendees,
        totalPrice: item.totalPrice,
        addedAt: item.addedAt
      };
    });

    res.status(200).json({
      success: true,
      data: {
        cart: detailedCart
      }
    });
  } catch (error) {
    // Get Cart Error
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Add an item to the cart
// @route   POST /api/cart
// @access  Private (Customers only)
exports.addToCart = async (req, res) => {
  console.log('🛒 [CART] Starting addToCart request:', {
    userId: req.user?.id,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  const { eventId, packageId, packageType, eventDate, eventTime, attendees, totalPrice } = req.body;

  if (!eventId || !packageType || !eventDate || !eventTime || !attendees || totalPrice === undefined) {
    console.log('❌ [CART] Validation failed - missing required fields:', {
      eventId: !!eventId,
      packageType: !!packageType,
      eventDate: !!eventDate,
      eventTime: !!eventTime,
      attendees: !!attendees,
      totalPrice: totalPrice !== undefined
    });
    return res.status(400).json({ success: false, message: 'Please provide eventId, packageType, eventDate, eventTime, attendees, and totalPrice.' });
  }

  // For flat price, packageId is not required
  if (packageType !== 'flatPrice' && !packageId) {
    console.log('❌ [CART] Validation failed - packageId required for non-flatPrice packages');
    return res.status(400).json({ success: false, message: 'packageId is required for regular and custom packages.' });
  }

  if (!['regular', 'custom', 'flatPrice'].includes(packageType)) {
    console.log('❌ [CART] Validation failed - invalid packageType:', packageType);
    return res.status(400).json({ success: false, message: 'packageType must be either "regular", "custom", or "flatPrice".' });
  }

  try {
    console.log('🔍 [CART] Fetching user from database:', req.user.id);
    const user = await User.findById(req.user.id);
    
    if (!user) {
      console.log('❌ [CART] User not found:', req.user.id);
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    console.log('👤 [CART] User found:', {
      id: user._id,
      role: user.role,
      hasCustomerProfile: !!user.customerProfile,
      hasCustomerCart: !!(user.customerProfile && user.customerProfile.customerCart),
      cartLength: user.customerProfile?.customerCart?.length || 0
    });

    // Ensure customerProfile and customerCart exist
    if (!user.customerProfile) {
      console.log('⚠️ [CART] Customer profile not found, initializing...');
      user.customerProfile = {
        customerCart: []
      };
    } else if (!user.customerProfile.customerCart) {
      console.log('⚠️ [CART] Customer cart not found, initializing...');
      user.customerProfile.customerCart = [];
    }

    // Clean up existing cart items that don't have required fields or have invalid formats
    const originalCartLength = user.customerProfile.customerCart.length;
    user.customerProfile.customerCart = user.customerProfile.customerCart.filter(item => {
      // Check if all required fields exist
      const hasRequiredFields = item.eventTime && item.eventDate && item.attendees && item.totalPrice !== undefined;
      
      // Check if eventTime is in the correct format (HH:MM AM/PM)
      const isValidEventTimeFormat = item.eventTime && /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(item.eventTime);
      
      const isValid = hasRequiredFields && isValidEventTimeFormat;
      
      if (!isValid) {
        console.log('🧹 [CART] Removing invalid cart item:', {
          itemId: item._id,
          hasEventTime: !!item.eventTime,
          hasEventDate: !!item.eventDate,
          hasAttendees: !!item.attendees,
          hasTotalPrice: item.totalPrice !== undefined,
          isValidEventTimeFormat,
          eventTimeValue: item.eventTime
        });
      }
      return isValid;
    });

    if (user.customerProfile.customerCart.length !== originalCartLength) {
      console.log('🧹 [CART] Cleaned up cart items:', {
        originalLength: originalCartLength,
        newLength: user.customerProfile.customerCart.length,
        removedCount: originalCartLength - user.customerProfile.customerCart.length
      });
    }
    
    // Handle both ObjectId and slug for event lookup
    let event = null;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
    
    console.log('🔍 [CART] Looking up event:', {
      eventId,
      isValidObjectId,
      searchMethod: isValidObjectId ? 'by ID' : 'by slug'
    });
    
    if (isValidObjectId) {
      // If it's a valid ObjectId, search by ID
      event = await Event.findById(eventId);
    } else {
      // If it's not a valid ObjectId, treat it as a slug
      event = await Event.findOne({ slug: eventId });
    }

    if (!event) {
      console.log('❌ [CART] Event not found:', eventId);
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    console.log('✅ [CART] Event found:', {
      id: event._id,
      name: event.name,
      hasPackages: !!(event.packages && event.packages.length > 0),
      hasCustomPackages: !!(event.customPackages && event.customPackages.length > 0),
      hasFlatPrice: !!(event.flatPrice && event.flatPrice.isActive)
    });

    let eventPackage;
    
    console.log('🔍 [CART] Validating package:', {
      packageType,
      packageId,
      eventId: event._id
    });
    
    if (packageType === 'flatPrice') {
      // For flat price, check if the event has an active flat price
      if (!event.flatPrice || !event.flatPrice.isActive) {
        console.log('❌ [CART] Event does not have active flat price:', {
          hasFlatPrice: !!event.flatPrice,
          isActive: event.flatPrice?.isActive
        });
        return res.status(400).json({ success: false, message: 'This event does not have an active flat price.' });
      }
      eventPackage = { name: 'Flat Price', price: event.flatPrice.amount };
      console.log('✅ [CART] Flat price package validated:', eventPackage);
    } else if (packageType === 'regular') {
      eventPackage = event.packages.id(packageId);
      if (!eventPackage) {
        console.log('❌ [CART] Regular package not found:', {
          packageId,
          availablePackages: event.packages?.map(p => p._id) || []
        });
        return res.status(404).json({ success: false, message: 'Package not found for this event.' });
      }
      console.log('✅ [CART] Regular package validated:', {
        id: eventPackage._id,
        name: eventPackage.name,
        price: eventPackage.price,
        pricingMode: eventPackage.pricingMode
      });
    } else {
      // For custom packages, check if it exists and is created for this customer
      eventPackage = event.customPackages.find(pkg => 
        pkg._id.toString() === packageId && 
        pkg.createdFor.toString() === req.user.id &&
        pkg.isActive
      );
      if (!eventPackage) {
        console.log('❌ [CART] Custom package not found or not available:', {
          packageId,
          userId: req.user.id,
          availableCustomPackages: event.customPackages?.map(p => ({
            id: p._id,
            createdFor: p.createdFor,
            isActive: p.isActive
          })) || []
        });
        return res.status(404).json({ success: false, message: 'Custom package not found or not available for you.' });
      }
      console.log('✅ [CART] Custom package validated:', {
        id: eventPackage._id,
        name: eventPackage.name,
        price: eventPackage.price,
        pricingMode: eventPackage.pricingMode
      });
    }
    
    // Check if the same event and package is already in the cart
    let itemExists;
    if (packageType === 'flatPrice') {
      // For flat price, check if the same event with flat price is already in cart
      itemExists = user.customerProfile.customerCart.some(item => 
        item.event.equals(event._id) && item.packageType === 'flatPrice'
      );
    } else if (eventPackage.pricingMode === 'flatPrice') {
      // For flat price custom packages, check if the same custom package is already in cart
      // Allow different flat price custom packages for the same event
      itemExists = user.customerProfile.customerCart.some(item => 
        item.event.equals(event._id) && item.packageType === packageType && item.package && item.package.equals(packageId)
      );
    } else {
      itemExists = user.customerProfile.customerCart.some(item => 
        item.event.equals(event._id) && item.packageType === packageType && item.package && item.package.equals(packageId)
      );
    }

    if (itemExists) {
        return res.status(409).json({ success: false, message: 'This item is already in your cart. You can update it from the cart page.' });
    }

    // Compute total price based on package type and pricing mode
    let computedTotalPrice = totalPrice;
    if (packageType === 'custom') {
      // Check if this is a flat price custom package
      if (eventPackage.pricingMode === 'flatPrice') {
        // For flat price custom packages, use the price as-is
        computedTotalPrice = Number(eventPackage.price) || 0;
      } else {
        // For per-attendee custom packages, multiply by attendees
        const unitPrice = Number(eventPackage.price) || 0;
        const qty = Number(attendees) || 1;
        computedTotalPrice = unitPrice * qty;
      }
    } else if (packageType === 'regular') {
      // Check if this is a flat price regular package
      if (eventPackage.pricingMode === 'flatPrice') {
        // For flat price regular packages, use the price as-is
        computedTotalPrice = Number(eventPackage.price) || 0;
      } else {
        // For per-attendee regular packages, multiply by attendees
        const unitPrice = Number(eventPackage.price) || 0;
        const qty = Number(attendees) || 1;
        computedTotalPrice = unitPrice * qty;
      }
    } else if (packageType === 'flatPrice') {
      // For legacy flat price events, use the flat price amount
      computedTotalPrice = Number(event.flatPrice.amount) || 0;
    }

    const cartItem = {
      event: event._id, // Use the actual ObjectId from the found event
      packageType,
      eventDate,
      eventTime,
      attendees: (packageType === 'flatPrice' || eventPackage.pricingMode === 'flatPrice') ? 1 : attendees,
      totalPrice: computedTotalPrice
    };

    // Set package field based on package type and pricing mode
    if (packageType === 'flatPrice') {
      // For regular flat price events, don't set package field
      // (package field is not required for flat price events)
    } else if (eventPackage.pricingMode === 'flatPrice') {
      // For flat price custom packages, still need to set package field
      // because it's a custom package, not a regular flat price event
      cartItem.package = packageId;
    } else {
      // For regular and per-attendee custom packages, set package field
      cartItem.package = packageId;
    }

    console.log('🛒 [CART] Adding item to cart:', {
      cartItem,
      currentCartLength: user.customerProfile.customerCart.length
    });

    user.customerProfile.customerCart.push(cartItem);

    console.log('💾 [CART] Saving user to database...');
    await user.save();
    console.log('✅ [CART] User saved successfully');

    // Create notification for vendor
    try {
      console.log('🔔 [CART] Creating notification for vendor...');
      const Notification = require('../models/Notification');
      const cartData = {
        customerId: req.user.id,
        eventId: event._id,
        packageType,
        eventDate,
        eventTime,
        attendees: (packageType === 'flatPrice' || eventPackage.pricingMode === 'flatPrice') ? 1 : attendees,
        totalPrice: computedTotalPrice
      };
      
      const notification = await Notification.createCartNotification(cartData);
      console.log('✅ [CART] Notification created:', notification._id);
      
      // Broadcast notification via socket if available
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.broadcastNotification(notification);
        console.log('📡 [CART] Notification broadcasted via socket');
      }
    } catch (notificationError) {
      console.log('⚠️ [CART] Failed to create cart notification:', notificationError.message);
      // Failed to create cart notification
      // Don't fail the cart operation if notification fails
    }

    console.log('🎉 [CART] Successfully added item to cart:', {
      userId: req.user.id,
      eventId: event._id,
      packageType,
      totalPrice: computedTotalPrice,
      finalCartLength: user.customerProfile.customerCart.length
    });

    res.status(201).json({
      success: true,
      message: 'Item added to cart successfully.',
      data: {
        cart: user.customerProfile.customerCart
      }
    });

  } catch (error) {
    console.error('💥 [CART] Add to Cart Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update a cart item
// @route   PATCH /api/cart/:cartItemId
// @access  Private (Customers only)
exports.updateCartItem = async (req, res) => {
  const { cartItemId } = req.params;
  const { packageId, eventDate, eventTime, attendees, totalPrice } = req.body;
  
  try {
    const user = await User.findById(req.user.id);
    const cartItem = user.customerProfile.customerCart.id(cartItemId);

    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    // If packageId is being updated, validate it (only for non-flat price items)
    if (packageId && cartItem.packageType !== 'flatPrice') {
      const event = await Event.findById(cartItem.event);
      if (!event.packages.id(packageId)) {
        return res.status(400).json({ success: false, message: 'Invalid package for this event.' });
      }
      cartItem.package = packageId;
    }

    // Update other fields if provided
    if (eventDate) cartItem.eventDate = eventDate;
    if (eventTime) cartItem.eventTime = eventTime;
    if (attendees) cartItem.attendees = attendees;
    if (totalPrice !== undefined) cartItem.totalPrice = totalPrice;

    await user.save();
    
    res.status(200).json({
        success: true,
        message: 'Cart item updated successfully.',
        data: {
          cart: user.customerProfile.customerCart
        }
    });

  } catch (error) {
    // Update Cart Error
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Remove an item from the cart
// @route   DELETE /api/cart/:cartItemId
// @access  Private (Customers only)
exports.removeFromCart = async (req, res) => {
  const { cartItemId } = req.params;

  try {
    const user = await User.findById(req.user.id);
    const cart = user.customerProfile.customerCart;
    const initialLength = cart.length;

    // Find the cart item before removing it to get details for notification
    const cartItem = cart.id(cartItemId);
    if (!cartItem) {
        return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    // Get event details for notification
    const event = await Event.findById(cartItem.event).select('name vendor imageUrls');
    if (!event) {
        return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // Use the .pull() method which is the correct way to remove a subdocument
    cart.pull(cartItemId);

    // Check if an item was actually removed
    if (cart.length === initialLength) {
        return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    await user.save();

    // Create notification for vendor about cart removal
    try {
      const Notification = require('../models/Notification');
      const cartData = {
        customerId: req.user.id,
        eventId: cartItem.event,
        packageType: cartItem.packageType,
        eventDate: cartItem.eventDate,
        eventTime: cartItem.eventTime,
        attendees: cartItem.attendees,
        totalPrice: cartItem.totalPrice
      };
      
      const notification = await Notification.createCartRemovalNotification(cartData);
      
      // Broadcast notification via socket if available
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.broadcastNotification(notification);
      }
    } catch (notificationError) {
      // Failed to create cart removal notification
      // Don't fail the cart operation if notification fails
    }

    res.status(200).json({
        success: true,
        message: 'Item removed from cart successfully.'
    });

  } catch (error) {
    // Remove From Cart Error
    res.status(500).json({ success: false, message: 'Server Error' });
  }
}; 