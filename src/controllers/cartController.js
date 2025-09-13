const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');

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
    console.error('Get Cart Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Add an item to the cart
// @route   POST /api/cart
// @access  Private (Customers only)
exports.addToCart = async (req, res) => {
  const { eventId, packageId, packageType, eventDate, eventTime, attendees, totalPrice } = req.body;

  if (!eventId || !packageType || !eventDate || !eventTime || !attendees || totalPrice === undefined) {
    return res.status(400).json({ success: false, message: 'Please provide eventId, packageType, eventDate, eventTime, attendees, and totalPrice.' });
  }

  // For flat price, packageId is not required
  if (packageType !== 'flatPrice' && !packageId) {
    return res.status(400).json({ success: false, message: 'packageId is required for regular and custom packages.' });
  }

  if (!['regular', 'custom', 'flatPrice'].includes(packageType)) {
    return res.status(400).json({ success: false, message: 'packageType must be either "regular", "custom", or "flatPrice".' });
  }

  try {
    const user = await User.findById(req.user.id);
    
    // Handle both ObjectId and slug for event lookup
    let event = null;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
    
    if (isValidObjectId) {
      // If it's a valid ObjectId, search by ID
      event = await Event.findById(eventId);
    } else {
      // If it's not a valid ObjectId, treat it as a slug
      event = await Event.findOne({ slug: eventId });
    }

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    let eventPackage;
    
    if (packageType === 'flatPrice') {
      // For flat price, check if the event has an active flat price
      if (!event.flatPrice || !event.flatPrice.isActive) {
        return res.status(400).json({ success: false, message: 'This event does not have an active flat price.' });
      }
      eventPackage = { name: 'Flat Price', price: event.flatPrice.amount };
    } else if (packageType === 'regular') {
      eventPackage = event.packages.id(packageId);
      if (!eventPackage) {
        return res.status(404).json({ success: false, message: 'Package not found for this event.' });
      }
    } else {
      // For custom packages, check if it exists and is created for this customer
      eventPackage = event.customPackages.find(pkg => 
        pkg._id.toString() === packageId && 
        pkg.createdFor.toString() === req.user.id &&
        pkg.isActive
      );
      if (!eventPackage) {
        return res.status(404).json({ success: false, message: 'Custom package not found or not available for you.' });
      }
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

    // Compute total price for custom packages on the server to ensure correctness
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
    }

    const cartItem = {
      event: event._id, // Use the actual ObjectId from the found event
      packageType,
      eventDate,
      eventTime,
      attendees: eventPackage.pricingMode === 'flatPrice' ? 1 : attendees,
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

    user.customerProfile.customerCart.push(cartItem);

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Item added to cart successfully.',
      data: {
        cart: user.customerProfile.customerCart
      }
    });

  } catch (error) {
    console.error('Add to Cart Error:', error);
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
    console.error('Update Cart Error:', error);
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

    // Use the .pull() method which is the correct way to remove a subdocument
    cart.pull(cartItemId);

    // Check if an item was actually removed
    if (cart.length === initialLength) {
        return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    await user.save();

    res.status(200).json({
        success: true,
        message: 'Item removed from cart successfully.'
    });

  } catch (error) {
    console.error('Remove From Cart Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
}; 