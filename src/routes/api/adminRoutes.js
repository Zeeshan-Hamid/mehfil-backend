const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');

const {
  getOverview,
  // Users
  listUsers, getUser, updateUserStatus, updateUserVerification, updateUserRole, deleteUser,
  // Vendors
  updateVendorFlags, updateVendorHalal,
  // Events
  listEvents, createEventForVendor, updateEvent, deleteEvent, toggleEventFeatured,
  // Bookings
  listBookings, getBooking, updateBookingStatus, deleteBooking,
  // Invoices
  listInvoices, getInvoice, updateInvoiceStatus, deleteInvoice,
  // Reviews
  listReviews, deleteReview,
  // Newsletter
  listNewsletter, updateNewsletter, deleteNewsletter,
  // Contacts
  listContacts, getContact, updateContact, deleteContact,
  // Notifications
  broadcastNotification,
  // User Events & Todos
  listUserEvents, getUserEvent, updateUserEvent, deleteUserEvent,
  listTodos, updateTodo, deleteTodo
} = require('../../controllers/adminController');

// All routes here are admin-only
router.use(protect, restrictTo('admin'));

// Overview / analytics
router.get('/overview', getOverview);

// Users
router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/verification', updateUserVerification);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

// Vendors
router.patch('/vendors/:id/flags', updateVendorFlags);
router.patch('/vendors/:id/halal', updateVendorHalal);

// Events (Listings)
router.get('/events', listEvents);
router.post('/events', createEventForVendor);
router.patch('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);
router.patch('/events/:id/featured', toggleEventFeatured);

// Bookings
router.get('/bookings', listBookings);
router.get('/bookings/:id', getBooking);
router.patch('/bookings/:id/status', updateBookingStatus);
router.delete('/bookings/:id', deleteBooking);

// Invoices
router.get('/invoices', listInvoices);
router.get('/invoices/:id', getInvoice);
router.patch('/invoices/:id/status', updateInvoiceStatus);
router.delete('/invoices/:id', deleteInvoice);

// Reviews
router.get('/reviews', listReviews);
router.delete('/reviews/:id', deleteReview);

// Newsletter subscribers
router.get('/newsletter', listNewsletter);
router.patch('/newsletter/:id', updateNewsletter);
router.delete('/newsletter/:id', deleteNewsletter);

// Contact submissions (support)
router.get('/contacts', listContacts);
router.get('/contacts/:id', getContact);
router.patch('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);

// Broadcast notification (system-wide)
router.post('/notifications/broadcast', broadcastNotification);

// User Events (Planners)
router.get('/user-events', listUserEvents);
router.get('/user-events/:id', getUserEvent);
router.patch('/user-events/:id', updateUserEvent);
router.delete('/user-events/:id', deleteUserEvent);

// Todos
router.get('/todos', listTodos);
router.patch('/todos/:id', updateTodo);
router.delete('/todos/:id', deleteTodo);

module.exports = router;


