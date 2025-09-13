const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const Review = require('../models/Review');
const Newsletter = require('../models/Newsletter');
const ContactUs = require('../models/ContactUs');
const Notification = require('../models/Notification');
const UserEvent = require('../models/UserEvent');
const Todo = require('../models/Todo');
const CheckoutSession = require('../models/CheckoutSession'); // Added for vendor deletion cascade
const Message = require('../models/Message'); // Added for vendor deletion cascade
const ViewCount = require('../models/ViewCount'); // Added for vendor deletion cascade
const PromotionalEvent = require('../models/PromotionalEvent');
const { processAndUploadPromotionalEventImages } = require('../services/fileUploadService');

const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- OVERVIEW / ANALYTICS ----------
exports.getOverview = catchAsync(async (req, res) => {
  const period = (req.query.period || 'year').toLowerCase(); // 'week' | 'month' | '6m' | 'year'
  const [totalUsers, totalCustomers, totalVendors, activeVendors, totalEvents, totalBookings] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: 'customer' }),
    User.countDocuments({ role: 'vendor' }),
    User.countDocuments({ role: 'vendor', isActive: true }),
    Event.countDocuments({}),
    Booking.countDocuments({}),
  ]);

  const completedRevenueAgg = await Booking.aggregate([
    { $match: { status: 'Completed' } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$totalPrice', 0] } } } },
  ]);
  const completedRevenue = (completedRevenueAgg[0] && completedRevenueAgg[0].total) || 0;

  const invoiceAgg = await Invoice.aggregate([
    { $group: { _id: '$status', amount: { $sum: '$total' }, count: { $sum: 1 } } },
  ]);
  const invoiceSummary = invoiceAgg.reduce((acc, cur) => {
    acc[cur._id] = { count: cur.count, amount: cur.amount };
    return acc;
  }, {});

  // Growth (period selectable)
  const now = new Date();
  let usersSeries = [];
  let bookingsSeries = [];

  if (period === 'week' || period === 'month') {
    // Daily series for last 7 or 30 days
    const days = period === 'week' ? 7 : 30;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    start.setUTCHours(0, 0, 0, 0);

    const dayKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    // Aggregate by day for users
    const usersAgg = await User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' }, d: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 } } },
    ]);
    const bookingsAgg = await Booking.aggregate([
      { $match: { bookingDate: { $gte: start } } },
      { $group: { _id: { y: { $year: '$bookingDate' }, m: { $month: '$bookingDate' }, d: { $dayOfMonth: '$bookingDate' } }, count: { $sum: 1 } } },
    ]);
    const usersMap = new Map(usersAgg.map((g) => [
      `${g._id.y}-${g._id.m}-${g._id.d}`, g.count
    ]));
    const bookingsMap = new Map(bookingsAgg.map((g) => [
      `${g._id.y}-${g._id.m}-${g._id.d}`, g.count
    ]));

    usersSeries = Array.from({ length: days }).map((_, i) => {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
      return { label: d.toLocaleString('en-US', { month: 'short', day: 'numeric' }), count: usersMap.get(dayKey(d)) || 0 };
    });
    bookingsSeries = Array.from({ length: days }).map((_, i) => {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
      return { label: d.toLocaleString('en-US', { month: 'short', day: 'numeric' }), count: bookingsMap.get(dayKey(d)) || 0 };
    });
  } else {
    // Monthly series for last 6 or 12 months
    const monthsWindow = period === '6m' ? 6 : 12;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsWindow - 1), 1));
    const monthKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    const months = Array.from({ length: monthsWindow }).map((_, i) => {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      return { key: monthKey(d), label: d.toLocaleString('en-US', { month: 'short' }) };
    });

    const usersAgg = await User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    ]);
    const bookingsAgg = await Booking.aggregate([
      { $match: { bookingDate: { $gte: start } } },
      { $group: { _id: { y: { $year: '$bookingDate' }, m: { $month: '$bookingDate' } }, count: { $sum: 1 } } },
    ]);

    const toKey = (g) => `${g._id.y}-${g._id.m}`;
    usersSeries = months.map((m) => ({ label: m.label, count: (usersAgg.find((g) => toKey(g) === m.key)?.count) || 0 }));
    bookingsSeries = months.map((m) => ({ label: m.label, count: (bookingsAgg.find((g) => toKey(g) === m.key)?.count) || 0 }));
  }

  // Top categories by event count
  const topCategoriesAgg = await Event.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  const topCategories = topCategoriesAgg.map((c) => ({ category: c._id, count: c.count }));

  // Booking status distribution across the site
  const statusAgg = await Booking.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const bookingStatusDistribution = statusAgg.reduce((acc, cur) => { acc[cur._id] = cur.count; return acc; }, {});

  // Top vendors by revenue and bookings (Completed revenue)
  const topVendorsRevenueAgg = await Booking.aggregate([
    { $match: { status: 'Completed' } },
    { $group: { _id: '$vendor', revenue: { $sum: { $ifNull: ['$totalPrice', 0] } }, bookings: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);
  const vendorIds = topVendorsRevenueAgg.map((v) => v._id).filter(Boolean);
  const vendors = vendorIds.length ? await User.find({ _id: { $in: vendorIds } }).select('vendorProfile.businessName email') : [];
  const vendorsMap = new Map(vendors.map((v) => [v._id.toString(), v]));
  const topVendors = topVendorsRevenueAgg.map((v) => ({
    vendorId: v._id,
    businessName: vendorsMap.get(v._id?.toString())?.vendorProfile?.businessName || 'Vendor',
    email: vendorsMap.get(v._id?.toString())?.email || '',
    revenue: v.revenue,
    bookings: v.bookings,
  }));

  res.status(200).json({
    success: true,
    data: {
      counts: {
        totalUsers,
        totalCustomers,
        totalVendors,
        activeVendors,
        totalEvents,
        totalBookings,
      },
      revenue: { completedRevenue, invoices: invoiceSummary },
      growth: { usersSeries, bookingsSeries, period },
      topCategories,
      bookingStatusDistribution,
      topVendors,
    },
  });
});

// ---------- USERS ----------
exports.listUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, role, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (role) query.role = role;
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { email: regex },
      { phoneNumber: regex },
      { 'customerProfile.fullName': regex },
      { 'vendorProfile.businessName': regex },
      { 'vendorProfile.ownerName': regex }
    ];
  }

  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const [users, total] = await Promise.all([
    User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires'),
    User.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { users, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.status(200).json({ success: true, data: { user } });
});

exports.getUserDeletionImpact = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin user' });

  let impact = {
    user: {
      id: user._id,
      email: user.email,
      role: user.role
    },
    willBeDeleted: {}
  };

  if (user.role === 'vendor') {
    const [
      eventsCount,
      bookingsCount,
      reviewsCount,
      checkoutSessionsCount,
      notificationsCount,
      messagesCount,
      invoicesCount,
      viewCountsCount
    ] = await Promise.all([
      Event.countDocuments({ vendor: user._id }),
      Booking.countDocuments({ vendor: user._id }),
      Review.countDocuments({ vendor: user._id }),
      CheckoutSession.countDocuments({ vendorId: user._id }),
      Notification.countDocuments({ $or: [{ recipient: user._id }, { sender: user._id }] }),
      Message.countDocuments({ $or: [{ sender: user._id }, { recipient: user._id }] }),
      Invoice.countDocuments({ vendor: user._id }),
      ViewCount.countDocuments({ vendorId: user._id })
    ]);

    impact.willBeDeleted = {
      events: eventsCount,
      bookings: bookingsCount,
      reviews: reviewsCount,
      checkoutSessions: checkoutSessionsCount,
      notifications: notificationsCount,
      messages: messagesCount,
      invoices: invoicesCount,
      viewCounts: viewCountsCount
    };

    // Check for active bookings
    const activeBookings = await Booking.countDocuments({ 
      vendor: user._id, 
      status: { $in: ['Pending', 'Confirmed'] } 
    });
    impact.activeBookings = activeBookings;

    // Check for pending payments
    const pendingPayments = await CheckoutSession.countDocuments({ 
      vendorId: user._id, 
      status: 'pending' 
    });
    impact.pendingPayments = pendingPayments;

  } else if (user.role === 'customer') {
    const [
      bookingsCount,
      reviewsCount,
      notificationsCount,
      messagesCount,
      userEventsCount,
      todosCount
    ] = await Promise.all([
      Booking.countDocuments({ customer: user._id }),
      Review.countDocuments({ customer: user._id }),
      Notification.countDocuments({ $or: [{ recipient: user._id }, { sender: user._id }] }),
      Message.countDocuments({ $or: [{ sender: user._id }, { recipient: user._id }] }),
      UserEvent.countDocuments({ user: user._id }),
      Todo.countDocuments({ user: user._id })
    ]);

    impact.willBeDeleted = {
      bookings: bookingsCount,
      reviews: reviewsCount,
      notifications: notificationsCount,
      messages: messagesCount,
      userEvents: userEventsCount,
      todos: todosCount
    };

    // Check for active bookings
    const activeBookings = await Booking.countDocuments({ 
      customer: user._id, 
      status: { $in: ['Pending', 'Confirmed'] } 
    });
    impact.activeBookings = activeBookings;
  }

  res.status(200).json({ success: true, data: { impact } });
});

exports.updateUserStatus = catchAsync(async (req, res) => {
  const { isActive } = req.body;
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: !!isActive },
    { new: true }
  ).select('email role isActive');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.status(200).json({ success: true, message: 'User status updated', data: { user } });
});

exports.updateUserVerification = catchAsync(async (req, res) => {
  const { emailVerified, phoneVerified } = req.body;
  const update = {};
  if (emailVerified !== undefined) update.emailVerified = !!emailVerified;
  if (phoneVerified !== undefined) update.phoneVerified = !!phoneVerified;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select(
    'email role emailVerified phoneVerified'
  );
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.status(200).json({ success: true, message: 'Verification updated', data: { user } });
});

exports.updateUserRole = catchAsync(async (req, res) => {
  const { role } = req.body;
  if (!['customer', 'vendor', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  // Ensure we keep only one admin in the system
  if (role === 'admin') {
    const existingAdmin = await User.findOne({ role: 'admin', _id: { $ne: user._id } });
    if (existingAdmin) {
      return res.status(409).json({ success: false, message: 'There is already an admin user' });
    }
  }
  user.role = role;
  await user.save({ validateBeforeSave: false });
  res.status(200).json({ success: true, message: 'User role updated', data: { user: { _id: user._id, email: user.email, role: user.role } } });
});

exports.deleteUser = catchAsync(async (req, res) => {
  const adminUser = req.user;
  console.log(`\n👑 ADMIN ACTION - User Deletion Request`);
  console.log(`👤 Admin: ${adminUser.email} (${adminUser.role})`);
  console.log(`🎯 Target User ID: ${req.params.id}`);
  console.log(`⏰ Requested at: ${new Date().toISOString()}`);
  
  const user = await User.findById(req.params.id);
  if (!user) {
    console.log(`❌ User not found: ${req.params.id}`);
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  
  console.log(`🎯 Target User: ${user.email} (${user.role})`);
  
  if (user.role === 'admin') {
    console.log(`❌ Cannot delete admin user: ${user.email}`);
    return res.status(400).json({ success: false, message: 'Cannot delete admin user' });
  }
  
  // If deleting a vendor, we need to clean up related data
  if (user.role === 'vendor') {
    try {
      // Check for active bookings that might need special handling
      const activeBookings = await Booking.find({ 
        vendor: user._id, 
        status: { $in: ['Pending', 'Confirmed'] } 
      });
      
      if (activeBookings.length > 0) {
        console.log(`❌ Cannot delete vendor with ${activeBookings.length} active bookings`);
        return res.status(400).json({ 
          success: false, 
          message: `Cannot delete vendor with ${activeBookings.length} active bookings. Please cancel or complete all bookings first.`,
          activeBookings: activeBookings.length
        });
      }
      
      // Check for pending payments
      const pendingPayments = await CheckoutSession.find({ 
        vendorId: user._id, 
        status: 'pending' 
      });
      
      if (pendingPayments.length > 0) {
        console.log(`❌ Cannot delete vendor with ${pendingPayments.length} pending payments`);
        return res.status(400).json({ 
          success: false, 
          message: `Cannot delete vendor with ${pendingPayments.length} pending payments. Please resolve all payment issues first.`,
          pendingPayments: pendingPayments.length
        });
      }
      
      console.log(`🧹 Cleaning up vendor data for: ${user.email}`);
      
      // Delete all events (listings) created by this vendor
      await Event.deleteMany({ vendor: user._id });
      
      // Delete all bookings for this vendor
      await Booking.deleteMany({ vendor: user._id });
      
      // Delete all reviews for this vendor
      await Review.deleteMany({ vendor: user._id });
      
      // Delete all checkout sessions for this vendor
      await CheckoutSession.deleteMany({ vendorId: user._id });
      
      // Delete all notifications for this vendor
      await Notification.deleteMany({ 
        $or: [
          { recipient: user._id },
          { sender: user._id }
        ]
      });
      
      // Delete all messages for this vendor
      await Message.deleteMany({
        $or: [
          { sender: user._id },
          { recipient: user._id }
        ]
      });
      
      // Delete all invoices for this vendor
      await Invoice.deleteMany({ vendor: user._id });
      
      // Delete all view counts for this vendor
      await ViewCount.deleteMany({ vendorId: user._id });
      
      console.log(`✅ Cleaned up all related data for vendor: ${user.email} (${user._id})`);
    } catch (error) {
      console.error('❌ Error cleaning up vendor data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to clean up vendor data. Please try again.' 
      });
    }
  } else if (user.role === 'customer') {
    try {
      // Check for active bookings that might need special handling
      const activeBookings = await Booking.find({ 
        customer: user._id, 
        status: { $in: ['Pending', 'Confirmed'] } 
      });
      
      if (activeBookings.length > 0) {
        console.log(`❌ Cannot delete customer with ${activeBookings.length} active bookings`);
        return res.status(400).json({ 
          success: false, 
          message: `Cannot delete customer with ${activeBookings.length} active bookings. Please cancel or complete all bookings first.`,
          activeBookings: activeBookings.length
        });
      }
      
      console.log(`🧹 Cleaning up customer data for: ${user.email}`);
      
      // Delete all bookings for this customer
      await Booking.deleteMany({ customer: user._id });
      
      // Delete all reviews by this customer
      await Review.deleteMany({ customer: user._id });
      
      // Delete all notifications for this customer
      await Notification.deleteMany({ 
        $or: [
          { recipient: user._id },
          { sender: user._id }
        ]
      });
      
      // Delete all messages for this customer
      await Message.deleteMany({
        $or: [
          { sender: user._id },
          { recipient: user._id }
        ]
      });
      
      // Delete all user events (planner) for this customer
      await UserEvent.deleteMany({ user: user._id });
      
      // Delete all todos for this customer
      await Todo.deleteMany({ user: user._id });
      
      console.log(`✅ Cleaned up all related data for customer: ${user.email} (${user._id})`);
    } catch (error) {
      console.error('❌ Error cleaning up customer data:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to clean up customer data. Please try again.' 
      });
    }
  }
  
  // Store user info for logging before deletion
  const userInfo = {
    id: user._id,
    email: user.email,
    role: user.role
  };
  
  // Delete the user
  await User.findByIdAndDelete(user._id);
  
  console.log(`✅ User deleted successfully: ${user.email} (${user.role})`);
  console.log(`👑 Admin action completed by: ${adminUser.email}`);
  console.log(`⏰ Completed at: ${new Date().toISOString()}\n`);
  
  res.status(200).json({ 
    success: true, 
    message: `${user.role === 'vendor' ? 'Vendor' : 'User'} deleted successfully`,
    deletedUser: userInfo
  });
});

// ---------- VENDORS ----------
exports.updateVendorFlags = catchAsync(async (req, res) => {
  const { isFeatured, verifiedBadge, halalVerifiedBadge } = req.body;
  const user = await User.findOne({ _id: req.params.id, role: 'vendor' });
  if (!user) return res.status(404).json({ success: false, message: 'Vendor not found' });

  if (typeof isFeatured === 'boolean') user.vendorProfile.isFeatured = isFeatured;
  if (typeof verifiedBadge === 'boolean') user.vendorProfile.verifiedBadge = verifiedBadge;
  if (typeof halalVerifiedBadge === 'boolean') user.vendorProfile.halalVerifiedBadge = halalVerifiedBadge;

  await user.save();
  res.status(200).json({ success: true, message: 'Vendor flags updated', data: { vendor: user.vendorProfile } });
});

exports.updateVendorHalal = catchAsync(async (req, res) => {
  const { hasHalalCert, certificationFile, certificateNumber, expiryDate, issuingAuthority, verifiedByAdmin, status } = req.body;
  const user = await User.findOne({ _id: req.params.id, role: 'vendor' });
  if (!user) return res.status(404).json({ success: false, message: 'Vendor not found' });

  const cert = user.vendorProfile.halalCertification;
  if (hasHalalCert !== undefined) cert.hasHalalCert = !!hasHalalCert;
  if (certificationFile !== undefined) cert.certificationFile = certificationFile;
  if (certificateNumber !== undefined) cert.certificateNumber = certificateNumber;
  if (expiryDate !== undefined) cert.expiryDate = expiryDate ? new Date(expiryDate) : null;
  if (issuingAuthority !== undefined) cert.issuingAuthority = issuingAuthority;
  if (verifiedByAdmin !== undefined) cert.verifiedByAdmin = !!verifiedByAdmin;
  if (status !== undefined) cert.status = status;

  await user.save();
  res.status(200).json({ success: true, message: 'Halal certification updated', data: { halalCertification: cert } });
});

// ---------- EVENTS (LISTINGS) ----------
exports.listEvents = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, vendorId, category, search } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (vendorId) query.vendor = new mongoose.Types.ObjectId(vendorId);
  if (category) query.category = category;
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [{ name: regex }, { description: regex }, { tags: regex }, { 'location.city': regex }, { 'location.state': regex }];
  }

  const [events, total] = await Promise.all([
    Event.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('vendor', 'vendorProfile.businessName vendorProfile.ownerName email'),
    Event.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { events, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.createEventForVendor = catchAsync(async (req, res) => {
  const { vendorId } = req.body;
  if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId is required' });
  const vendor = await User.findOne({ _id: vendorId, role: 'vendor' }).select('_id');
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

  const eventData = { ...req.body };
  delete eventData.vendorId;
  // Require at least name, category, description, imageUrls, services, location
  const required = ['name', 'category', 'description', 'imageUrls', 'services', 'location'];
  const missing = required.filter((k) => eventData[k] === undefined);
  if (missing.length) return res.status(400).json({ success: false, message: `Missing fields: ${missing.join(', ')}` });

  try {
    const event = await Event.create({ ...eventData, vendor: vendor._id });
    res.status(201).json({ success: true, message: 'Event created', data: { event } });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate event for this vendor (name/category must be unique per vendor)' });
    }
    throw e;
  }
});

exports.updateEvent = catchAsync(async (req, res) => {
  const update = { ...req.body };
  // Prevent moving event to different vendor via admin unless explicitly allowed
  if (update.vendor) delete update.vendor;
  const event = await Event.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  res.status(200).json({ success: true, message: 'Event updated', data: { event } });
});

exports.deleteEvent = catchAsync(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  await Event.findByIdAndDelete(event._id);
  res.status(200).json({ success: true, message: 'Event deleted' });
});

// Feature/unfeature listing
exports.toggleEventFeatured = catchAsync(async (req, res) => {
  const { isFeatured } = req.body;
  if (typeof isFeatured !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isFeatured must be boolean' });
  }
  const event = await Event.findByIdAndUpdate(
    req.params.id,
    { isFeatured, featuredAt: isFeatured ? new Date() : null },
    { new: true }
  );
  if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
  res.status(200).json({ success: true, message: 'Event feature flag updated', data: { event } });
});

// ---------- BOOKINGS ----------
exports.listBookings = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, vendorId, customerId } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (status) query.status = status;
  if (vendorId) query.vendor = new mongoose.Types.ObjectId(vendorId);
  if (customerId) query.customer = new mongoose.Types.ObjectId(customerId);

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .sort({ bookingDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('customer', 'customerProfile.fullName email')
      .populate('vendor', 'vendorProfile.businessName email')
      .select('+payment +customerSnapshot +eventSnapshot +packageSnapshot'),
    Booking.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { bookings, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getBooking = catchAsync(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('customer', 'customerProfile.fullName email')
    .populate('vendor', 'vendorProfile.businessName email');
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  res.status(200).json({ success: true, data: { booking } });
});

exports.updateBookingStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const allowed = ['Pending', 'Confirmed', 'Cancelled', 'Completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });
  }
  const booking = await Booking.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  res.status(200).json({ success: true, message: 'Booking status updated', data: { booking } });
});

exports.deleteBooking = catchAsync(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  await Booking.findByIdAndDelete(booking._id);
  res.status(200).json({ success: true, message: 'Booking deleted' });
});

// ---------- INVOICES ----------
exports.listInvoices = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, search, vendorId } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (vendorId) query.vendor = new mongoose.Types.ObjectId(vendorId);
  if (status && status !== 'all') query.status = status;
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [ { clientName: regex }, { event: regex }, { invoiceNumber: regex } ];
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('vendor', 'vendorProfile.businessName vendorProfile.ownerName email'),
    Invoice.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { invoices, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getInvoice = catchAsync(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id).populate('vendor', 'vendorProfile.businessName vendorProfile.ownerName email');
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.status(200).json({ success: true, data: { invoice } });
});

exports.updateInvoiceStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const allowed = ['Pending', 'Paid', 'Overdue', 'Cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status, paidAt: status === 'Paid' ? new Date() : undefined }, { new: true });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.status(200).json({ success: true, message: 'Invoice status updated', data: { invoice } });
});

exports.deleteInvoice = catchAsync(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  await Invoice.findByIdAndDelete(invoice._id);
  res.status(200).json({ success: true, message: 'Invoice deleted' });
});

// ---------- USER EVENTS (PLANNER) ----------
exports.listUserEvents = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, userId, status, search } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;
  const query = {};
  if (userId) query.user = new mongoose.Types.ObjectId(userId);
  if (status) query.status = status;
  if (search) query.title = new RegExp(search, 'i');

  const [items, total] = await Promise.all([
    UserEvent.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    UserEvent.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { userEvents: items, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getUserEvent = catchAsync(async (req, res) => {
  const item = await UserEvent.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'UserEvent not found' });
  res.status(200).json({ success: true, data: { userEvent: item } });
});

exports.updateUserEvent = catchAsync(async (req, res) => {
  const allowed = ['title', 'date', 'location', 'guests', 'status', 'icon', 'isCustomEvent', 'customEventType', 'description', 'notes', 'budget'];
  const update = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const item = await UserEvent.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'UserEvent not found' });
  res.status(200).json({ success: true, message: 'UserEvent updated', data: { userEvent: item } });
});

exports.deleteUserEvent = catchAsync(async (req, res) => {
  const item = await UserEvent.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'UserEvent not found' });
  await UserEvent.findByIdAndDelete(item._id);
  res.status(200).json({ success: true, message: 'UserEvent deleted' });
});

// ---------- TODOS ----------
exports.listTodos = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, userEventId, userId, status } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(200, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;
  const query = {};
  if (userEventId) query.userEvent = new mongoose.Types.ObjectId(userEventId);
  if (userId) query.user = new mongoose.Types.ObjectId(userId);
  if (status) query.status = status;
  const [items, total] = await Promise.all([
    Todo.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Todo.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { todos: items, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.updateTodo = catchAsync(async (req, res) => {
  const allowed = ['taskName', 'startDate', 'endDate', 'member', 'status', 'description'];
  const update = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const item = await Todo.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'Todo not found' });
  res.status(200).json({ success: true, message: 'Todo updated', data: { todo: item } });
});

exports.deleteTodo = catchAsync(async (req, res) => {
  const item = await Todo.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Todo not found' });
  await Todo.findByIdAndDelete(item._id);
  res.status(200).json({ success: true, message: 'Todo deleted' });
});

// ---------- REVIEWS ----------
exports.listReviews = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, eventId, vendorId } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (eventId) query.event = new mongoose.Types.ObjectId(eventId);
  if (vendorId) query.vendor = new mongoose.Types.ObjectId(vendorId);

  const [reviews, total] = await Promise.all([
    Review.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Review.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { reviews, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.deleteReview = catchAsync(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
  await Review.findByIdAndDelete(review._id);
  // Recalculate event aggregates
  if (review.event) await Review.calcAverageRatings(review.event);
  res.status(200).json({ success: true, message: 'Review deleted' });
});

// ---------- NEWSLETTER ----------
exports.listNewsletter = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, active, search } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(200, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;
  const query = {};
  if (active !== undefined) query.isActive = active === 'true';
  if (search) query.email = new RegExp(search, 'i');
  const [subs, total] = await Promise.all([
    Newsletter.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Newsletter.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { subscribers: subs, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.updateNewsletter = catchAsync(async (req, res) => {
  const { isActive } = req.body;
  const sub = await Newsletter.findByIdAndUpdate(req.params.id, { isActive: !!isActive }, { new: true });
  if (!sub) return res.status(404).json({ success: false, message: 'Subscriber not found' });
  res.status(200).json({ success: true, message: 'Subscriber updated', data: { subscriber: sub } });
});

exports.deleteNewsletter = catchAsync(async (req, res) => {
  const sub = await Newsletter.findById(req.params.id);
  if (!sub) return res.status(404).json({ success: false, message: 'Subscriber not found' });
  await Newsletter.findByIdAndDelete(sub._id);
  res.status(200).json({ success: true, message: 'Subscriber deleted' });
});

// ---------- CONTACT US ----------
exports.listContacts = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, priority, search } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;
  const query = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [{ email: regex }, { name: regex }, { message: regex }, { subject: regex }];
  }
  const [contacts, total] = await Promise.all([
    ContactUs.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    ContactUs.countDocuments(query),
  ]);
  res.status(200).json({ success: true, data: { contacts, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getContact = catchAsync(async (req, res) => {
  const contact = await ContactUs.findById(req.params.id);
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  res.status(200).json({ success: true, data: { contact } });
});

exports.updateContact = catchAsync(async (req, res) => {
  const allowed = ['status', 'priority', 'notes', 'assignedTo', 'responseSent', 'responseDate', 'responseMessage'];
  const update = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) update[k] = req.body[k];
  });
  const contact = await ContactUs.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  res.status(200).json({ success: true, message: 'Contact updated', data: { contact } });
});

exports.deleteContact = catchAsync(async (req, res) => {
  const contact = await ContactUs.findById(req.params.id);
  if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
  await ContactUs.findByIdAndDelete(contact._id);
  res.status(200).json({ success: true, message: 'Contact deleted' });
});

// ---------- NOTIFICATIONS (SYSTEM/BROADCAST) ----------
exports.broadcastNotification = catchAsync(async (req, res) => {
  const { title, message, type = 'system', role = 'all' } = req.body;
  if (!title || !message) return res.status(400).json({ success: false, message: 'title and message are required' });

  const userQuery = role === 'all' ? {} : { role };
  const users = await User.find(userQuery).select('_id');
  if (!users.length) return res.status(200).json({ success: true, message: 'No recipients' });

  const docs = users.map((u) => ({
    recipient: u._id,
    sender: req.user._id,
    type,
    title,
    message,
    data: {},
    actionUrl: '/',
    priority: 'medium',
  }));
  await Notification.insertMany(docs);
  res.status(201).json({ success: true, message: `Notification sent to ${users.length} users` });
});

// Explicitly avoid any message content endpoints per requirements.

// ---------- PROMOTIONAL EVENTS ----------
exports.listPromotionalEvents = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, search, isActive, isFeatured, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { title: regex },
      { description: regex },
      { tagline: regex },
      { 'location.city': regex },
      { 'location.state': regex }
    ];
  }

  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const [promotionalEvents, total] = await Promise.all([
    PromotionalEvent.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('createdBy', 'email'),
    PromotionalEvent.countDocuments(query),
  ]);

  res.status(200).json({ 
    success: true, 
    data: { 
      promotionalEvents, 
      pagination: { 
        total, 
        page: pageNum, 
        limit: limitNum, 
        pages: Math.ceil(total / limitNum) 
      } 
    } 
  });
});

exports.getPromotionalEvent = catchAsync(async (req, res) => {
  const promotionalEvent = await PromotionalEvent.findById(req.params.id)
    .populate('createdBy', 'email');
  if (!promotionalEvent) {
    return res.status(404).json({ success: false, message: 'Promotional event not found' });
  }
  res.status(200).json({ success: true, data: { promotionalEvent } });
});

exports.createPromotionalEvent = catchAsync(async (req, res) => {
  const { title, tagline, description, url, date, time, location, ticketPrice, ticketsAvailable } = req.body;
  
  // Parse location if it's a JSON string
  let parsedLocation = location;
  if (typeof location === 'string') {
    try {
      parsedLocation = JSON.parse(location);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid location format' 
      });
    }
  }
  
  // Validate required fields
  const required = ['title', 'description', 'date', 'location'];
  const missing = required.filter(field => !req.body[field]);
  if (missing.length) {
    return res.status(400).json({ 
      success: false, 
      message: `Missing required fields: ${missing.join(', ')}` 
    });
  }

  // Validate location fields
  if (!parsedLocation.city || !parsedLocation.state || !parsedLocation.zipCode) {
    return res.status(400).json({ 
      success: false, 
      message: 'Location must include city, state, and zipCode' 
    });
  }

  // Handle image uploads
  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    try {
      imageUrls = await processAndUploadPromotionalEventImages(req.files, req.user._id);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to upload images: ' + error.message 
      });
    }
  } else {
    return res.status(400).json({ 
      success: false, 
      message: 'At least one image is required' 
    });
  }

  const promotionalEventData = {
    createdBy: req.user._id,
    title,
    tagline,
    description,
    images: imageUrls,
    url,
    date: new Date(date),
    time,
    location: parsedLocation,
    ticketPrice,
    ticketsAvailable
  };

  const promotionalEvent = await PromotionalEvent.create(promotionalEventData);
  await promotionalEvent.populate('createdBy', 'email');
  
  res.status(201).json({ 
    success: true, 
    message: 'Promotional event created successfully', 
    data: { promotionalEvent } 
  });
});

exports.updatePromotionalEvent = catchAsync(async (req, res) => {
  const promotionalEvent = await PromotionalEvent.findById(req.params.id);
  if (!promotionalEvent) {
    return res.status(404).json({ success: false, message: 'Promotional event not found' });
  }

  const allowedUpdates = [
    'title', 'tagline', 'description', 'images', 'url', 'date', 'time', 
    'location', 'ticketPrice', 'ticketsAvailable', 'isActive', 'isFeatured'
  ];
  
  const update = {};
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      update[field] = req.body[field];
    }
  });


  // Parse location if it's a JSON string
  if (update.location && typeof update.location === 'string') {
    try {
      update.location = JSON.parse(update.location);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid location format' 
      });
    }
  }

  // Parse images if it's a JSON string
  if (update.images && typeof update.images === 'string') {
    try {
      update.images = JSON.parse(update.images);
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid images format' 
      });
    }
  }

  // Handle date conversion
  if (update.date) {
    update.date = new Date(update.date);
  }

  // Handle image updates - delete old images that are no longer in the new list
  if (update.images && Array.isArray(update.images)) {
    const oldImages = promotionalEvent.images || [];
    const newImages = update.images;
    
    // Find images to delete (images that were in oldImages but not in newImages)
    const imagesToDelete = oldImages.filter(oldImage => !newImages.includes(oldImage));
    
    // Delete old images from S3
    if (imagesToDelete.length > 0) {
      try {
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION
        });

        await Promise.all(imagesToDelete.map(async (imageUrl) => {
          try {
            // Extract the key from the S3 URL
            const urlParts = imageUrl.split('/');
            const key = urlParts.slice(3).join('/'); // Remove the domain parts
            
                   await s3.deleteObject({
                     Bucket: process.env.S3_BUCKET_NAME,
                     Key: key
                   }).promise();
                 } catch (error) {
                   // Don't throw error here, just log it
                 }
               }));
             } catch (error) {
               // Don't throw error here, just log it
             }
    }
  }

  // Handle new image uploads if any files are provided
  let newImageUrls = [];
  if (req.files && req.files.length > 0) {
    try {
      const { processAndUploadPromotionalEventImages } = require('../services/fileUploadService');
      newImageUrls = await processAndUploadPromotionalEventImages(req.files, req.user._id);
      
      // Add new images to the existing images
      if (update.images) {
        update.images = [...update.images, ...newImageUrls];
      } else {
        update.images = [...(promotionalEvent.images || []), ...newImageUrls];
      }
      
    } catch (error) {
      return res.status(400).json({ 
        success: false, 
        message: 'Failed to upload new images: ' + error.message 
      });
    }
  }

  const updatedPromotionalEvent = await PromotionalEvent.findByIdAndUpdate(
    req.params.id,
    update,
    { new: true, runValidators: true }
  ).populate('createdBy', 'email');

  res.status(200).json({ 
    success: true, 
    message: 'Promotional event updated successfully', 
    data: { promotionalEvent: updatedPromotionalEvent } 
  });
});

exports.deletePromotionalEvent = catchAsync(async (req, res) => {
  const promotionalEvent = await PromotionalEvent.findById(req.params.id);
  if (!promotionalEvent) {
    return res.status(404).json({ success: false, message: 'Promotional event not found' });
  }

  await PromotionalEvent.findByIdAndDelete(promotionalEvent._id);
  res.status(200).json({ success: true, message: 'Promotional event deleted successfully' });
});

exports.togglePromotionalEventFeatured = catchAsync(async (req, res) => {
  const { isFeatured } = req.body;
  if (typeof isFeatured !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isFeatured must be boolean' });
  }

  const promotionalEvent = await PromotionalEvent.findByIdAndUpdate(
    req.params.id,
    { isFeatured, featuredAt: isFeatured ? new Date() : null },
    { new: true }
  ).populate('createdBy', 'email');

  if (!promotionalEvent) {
    return res.status(404).json({ success: false, message: 'Promotional event not found' });
  }

  res.status(200).json({ 
    success: true, 
    message: 'Promotional event feature flag updated', 
    data: { promotionalEvent } 
  });
});

exports.togglePromotionalEventActive = catchAsync(async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isActive must be boolean' });
  }

  const promotionalEvent = await PromotionalEvent.findByIdAndUpdate(
    req.params.id,
    { isActive },
    { new: true }
  ).populate('createdBy', 'email');

  if (!promotionalEvent) {
    return res.status(404).json({ success: false, message: 'Promotional event not found' });
  }

  res.status(200).json({ 
    success: true, 
    message: `Event ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: { promotionalEvent }
  });
});

module.exports = {
  getOverview: exports.getOverview,
  listUsers: exports.listUsers,
  getUser: exports.getUser,
  getUserDeletionImpact: exports.getUserDeletionImpact,
  updateUserStatus: exports.updateUserStatus,
  updateUserVerification: exports.updateUserVerification,
  updateUserRole: exports.updateUserRole,
  deleteUser: exports.deleteUser,
  updateVendorFlags: exports.updateVendorFlags,
  updateVendorHalal: exports.updateVendorHalal,
  listEvents: exports.listEvents,
  createEventForVendor: exports.createEventForVendor,
  updateEvent: exports.updateEvent,
  deleteEvent: exports.deleteEvent,
  toggleEventFeatured: exports.toggleEventFeatured,
  listBookings: exports.listBookings,
  getBooking: exports.getBooking,
  updateBookingStatus: exports.updateBookingStatus,
  deleteBooking: exports.deleteBooking,
  listInvoices: exports.listInvoices,
  getInvoice: exports.getInvoice,
  updateInvoiceStatus: exports.updateInvoiceStatus,
  deleteInvoice: exports.deleteInvoice,
  // Planner (User Events)
  listUserEvents: exports.listUserEvents,
  getUserEvent: exports.getUserEvent,
  updateUserEvent: exports.updateUserEvent,
  deleteUserEvent: exports.deleteUserEvent,
  // Todos
  listTodos: exports.listTodos,
  updateTodo: exports.updateTodo,
  deleteTodo: exports.deleteTodo,
  listReviews: exports.listReviews,
  deleteReview: exports.deleteReview,
  listNewsletter: exports.listNewsletter,
  updateNewsletter: exports.updateNewsletter,
  deleteNewsletter: exports.deleteNewsletter,
  listContacts: exports.listContacts,
  getContact: exports.getContact,
  updateContact: exports.updateContact,
  deleteContact: exports.deleteContact,
  broadcastNotification: exports.broadcastNotification,
  // Promotional Events
  listPromotionalEvents: exports.listPromotionalEvents,
  getPromotionalEvent: exports.getPromotionalEvent,
  createPromotionalEvent: exports.createPromotionalEvent,
  updatePromotionalEvent: exports.updatePromotionalEvent,
  deletePromotionalEvent: exports.deletePromotionalEvent,
  togglePromotionalEventFeatured: exports.togglePromotionalEventFeatured,
  togglePromotionalEventActive: exports.togglePromotionalEventActive,
};


