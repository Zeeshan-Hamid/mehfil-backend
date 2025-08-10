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

const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- OVERVIEW / ANALYTICS ----------
exports.getOverview = catchAsync(async (req, res) => {
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

  // Monthly growth (last 12 months) for users and bookings
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const monthKey = (d) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return { key: monthKey(d), label: d.toLocaleString('en-US', { month: 'short' }) };
  });

  const usersByMonthAgg = await User.aggregate([
    { $match: { createdAt: { $gte: start } } },
    { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
  ]);
  const bookingsByMonthAgg = await Booking.aggregate([
    { $match: { bookingDate: { $gte: start } } },
    { $group: { _id: { y: { $year: '$bookingDate' }, m: { $month: '$bookingDate' } }, count: { $sum: 1 } } },
  ]);

  const toKey = (g) => `${g._id.y}-${g._id.m}`;
  const usersByMonth = months.map((m) => ({ month: m.label, count: (usersByMonthAgg.find((g) => toKey(g) === m.key)?.count) || 0 }));
  const bookingsByMonth = months.map((m) => ({ month: m.label, count: (bookingsByMonthAgg.find((g) => toKey(g) === m.key)?.count) || 0 }));

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
      growth: { usersByMonth, bookingsByMonth },
      topCategories,
      bookingStatusDistribution,
      topVendors,
    },
  });
});

// ---------- USERS ----------
exports.listUsers = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, role, active, search } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(100, parseInt(limit, 10));
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  if (role) query.role = role;
  if (active !== undefined) query.isActive = active === 'true';
  if (search) {
    const regex = new RegExp(search, 'i');
    query.$or = [
      { email: regex },
      { 'customerProfile.fullName': regex },
      { 'vendorProfile.businessName': regex },
      { phoneNumber: regex },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires'),
    User.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: { users, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } },
  });
});

exports.getUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).select(
    '-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires'
  );
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.status(200).json({ success: true, data: { user } });
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
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin user' });
  await User.findByIdAndDelete(user._id);
  res.status(200).json({ success: true, message: 'User deleted' });
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
    Event.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('vendor', 'vendorProfile.businessName email'),
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
    Booking.find(query).sort({ bookingDate: -1 }).skip(skip).limit(limitNum),
    Booking.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { bookings, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getBooking = catchAsync(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
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
    Invoice.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Invoice.countDocuments(query),
  ]);

  res.status(200).json({ success: true, data: { invoices, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } } });
});

exports.getInvoice = catchAsync(async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);
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

module.exports = {
  getOverview: exports.getOverview,
  listUsers: exports.listUsers,
  getUser: exports.getUser,
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
};


