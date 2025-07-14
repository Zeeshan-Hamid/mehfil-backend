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
      select: 'name imageUrls packages location' 
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
      if (item.packageType === 'regular') {
        eventPackage = item.event.packages.id(item.package);
      } else {
        // For custom packages, find the specific custom package
        eventPackage = item.event.customPackages.find(pkg => pkg._id.toString() === item.package.toString());
      }
      
      return {
        _id: item._id,
        event: {
          _id: item.event._id,
          name: item.event.name,
          imageUrl: item.event.imageUrls[0], // Show the primary image
          location: item.event.location
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
  const { eventId, packageId, packageType, eventDate, attendees, totalPrice } = req.body;

  if (!eventId || !packageId || !packageType || !eventDate || !attendees || totalPrice === undefined) {
    return res.status(400).json({ success: false, message: 'Please provide eventId, packageId, packageType, eventDate, attendees, and totalPrice.' });
  }

  if (!['regular', 'custom'].includes(packageType)) {
    return res.status(400).json({ success: false, message: 'packageType must be either "regular" or "custom".' });
  }

  try {
    const user = await User.findById(req.user.id);
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    let eventPackage;
    
    if (packageType === 'regular') {
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
    const itemExists = user.customerProfile.customerCart.some(item => 
      item.event.equals(eventId) && item.package.equals(packageId) && item.packageType === packageType
    );

    if (itemExists) {
        return res.status(409).json({ success: false, message: 'This item is already in your cart. You can update it from the cart page.' });
    }

    user.customerProfile.customerCart.push({
      event: eventId,
      package: packageId,
      packageType,
      eventDate,
      attendees,
      totalPrice
    });

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
  const { packageId, eventDate, attendees, totalPrice } = req.body;
  
  try {
    const user = await User.findById(req.user.id);
    const cartItem = user.customerProfile.customerCart.id(cartItemId);

    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    // If packageId is being updated, validate it
    if (packageId) {
      const event = await Event.findById(cartItem.event);
      if (!event.packages.id(packageId)) {
        return res.status(400).json({ success: false, message: 'Invalid package for this event.' });
      }
      cartItem.package = packageId;
    }

    // Update other fields if provided
    if (eventDate) cartItem.eventDate = eventDate;
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