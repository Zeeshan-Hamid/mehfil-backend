const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Event = require('../models/Event');
const Message = require('../models/Message');

// Simple async wrapper
const catchAsync = fn => (req, res, next) => fn(req, res, next).catch(next);

// Helpers
const getLastNMonths = (n, tz = 'UTC') => {
  const now = new Date();
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: tz });
    const year = d.getUTCFullYear();
    months.push({ key: `${year}-${d.getUTCMonth() + 1}`, month, year, monthIndex: d.getUTCMonth() });
  }
  return months;
};

const monthKey = (date) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;

exports.getVendorAnalytics = catchAsync(async (req, res) => {
  const vendorId = req.user.id;
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  const monthsWindow = parseInt(req.query.months || '6', 10);
  const tz = req.query.tz || 'UTC';
  const startDate = new Date();
  startDate.setUTCMonth(startDate.getUTCMonth() - (monthsWindow - 1), 1);
  startDate.setUTCHours(0, 0, 0, 0);

  // 1) Revenue by month (Completed bookings)
  const completedBookings = await Booking.find({
    vendor: vendorObjectId,
    status: 'Completed',
    bookingDate: { $gte: startDate }
  }).select('totalPrice bookingDate').lean();

  const months = getLastNMonths(monthsWindow, tz);
  const revenueMap = new Map(months.map(m => [m.key, 0]));
  completedBookings.forEach(b => {
    const key = monthKey(new Date(b.bookingDate));
    revenueMap.set(key, (revenueMap.get(key) || 0) + (b.totalPrice || 0));
  });
  const revenueByMonth = months.map(m => ({ month: m.month, revenue: revenueMap.get(m.key) || 0 }));

  // 2) Bookings by month (Confirmed + Completed)
  const activeBookings = await Booking.find({
    vendor: vendorObjectId,
    status: { $in: ['Confirmed', 'Completed'] },
    bookingDate: { $gte: startDate }
  }).select('bookingDate').lean();

  const bookingsMap = new Map(months.map(m => [m.key, 0]));
  activeBookings.forEach(b => {
    const key = monthKey(new Date(b.bookingDate));
    bookingsMap.set(key, (bookingsMap.get(key) || 0) + 1);
  });
  const bookingsByMonth = months.map(m => ({ month: m.month, bookings: bookingsMap.get(m.key) || 0 }));

  // 3) Inquiry to booking rate and average response time from Messages
  const messages = await Message.find({
    $or: [ { sender: vendorObjectId }, { receiver: vendorObjectId } ],
    createdAt: { $gte: startDate }
  }).sort({ conversationId: 1, createdAt: 1 }).lean();

  let totalResponseHours = 0;
  let responseSamples = 0;
  let inquiries = 0; // conversations initiated by customer

  // Group by conversationId
  const conversations = new Map();
  for (const msg of messages) {
    if (!conversations.has(msg.conversationId)) conversations.set(msg.conversationId, []);
    conversations.get(msg.conversationId).push(msg);
  }

  const customerIdsFromInquiries = new Set();
  for (const [convId, msgs] of conversations.entries()) {
    if (msgs.length === 0) continue;
    const first = msgs[0];
    const vendorInvolved = first.sender.toString() === vendorId || first.receiver.toString() === vendorId;
    if (!vendorInvolved) continue;

    const vendorIsSenderFirst = first.sender.toString() === vendorId;
    const otherUserId = vendorIsSenderFirst ? first.receiver.toString() : first.sender.toString();

    // Consider inquiry only if first message is from customer (not vendor)
    if (!vendorIsSenderFirst) {
      inquiries += 1;
      customerIdsFromInquiries.add(otherUserId);
      // Find first vendor reply after the first message
      const firstCustomerTime = first.createdAt;
      const vendorReply = msgs.find(m => m.sender.toString() === vendorId && new Date(m.createdAt) > new Date(firstCustomerTime));
      if (vendorReply) {
        const diffMs = new Date(vendorReply.createdAt) - new Date(firstCustomerTime);
        const hours = diffMs / (1000 * 60 * 60);
        totalResponseHours += hours;
        responseSamples += 1;
      }
    }
  }

  const avgResponseTime = responseSamples > 0 ? +(totalResponseHours / responseSamples).toFixed(1) : 0;

  // Bookings unique customers in window for conversion rate
  const bookingsInWindow = await Booking.find({
    vendor: vendorObjectId,
    bookingDate: { $gte: startDate },
    status: { $in: ['Pending', 'Confirmed', 'Completed'] }
  }).select('customer').lean();
  const bookedCustomerIds = new Set(bookingsInWindow.map(b => b.customer.toString()));
  const inquiriesDenominator = customerIdsFromInquiries.size || inquiries || 1; // avoid div by 0
  const inquiryToBookingRate = Math.max(0, Math.min(1, bookedCustomerIds.size / inquiriesDenominator));

  // 4) Popular services (by bookings per event and event.services)
  const bookingsAll = await Booking.aggregate([
    { $match: { vendor: vendorObjectId, bookingDate: { $gte: startDate } } },
    { $group: { _id: '$event', count: { $sum: 1 } } }
  ]);
  const eventIdToBookings = new Map(bookingsAll.map(b => [b._id?.toString(), b.count]));
  const eventIds = Array.from(eventIdToBookings.keys()).filter(Boolean);
  let serviceCounts = new Map();
  if (eventIds.length > 0) {
    const events = await Event.find({ _id: { $in: eventIds } }).select('services').lean();
    for (const ev of events) {
      const weight = eventIdToBookings.get(ev._id.toString()) || 0;
      (ev.services || []).forEach(svc => {
        serviceCounts.set(svc, (serviceCounts.get(svc) || 0) + weight);
      });
    }
  }
  const popularServices = Array.from(serviceCounts.entries())
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // 5) Booking status distribution (extra useful metric)
  const statusAgg = await Booking.aggregate([
    { $match: { vendor: vendorObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  const statusDistribution = statusAgg.reduce((acc, cur) => {
    acc[cur._id] = cur.count;
    return acc;
  }, {});

  res.status(200).json({
    success: true,
    data: {
      revenueByMonth,
      bookingsByMonth,
      inquiryToBookingRate,
      avgResponseTime,
      popularServices,
      statusDistribution
    }
  });
});

module.exports = {
  getVendorAnalytics: exports.getVendorAnalytics
};


