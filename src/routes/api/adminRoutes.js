const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { uploadInMemory } = require('../../services/fileUploadService');

const {
  getOverview,
  // Users
  listUsers, getUser, updateUserStatus, updateUserVerification, updateUserRole, deleteUser,
  // Vendors
  updateVendorFlags, updateVendorHalal,
  // Vendor Verification
  listVendorsForVerification, updateVendorVerification, listVendorsForSelection,
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
  listTodos, updateTodo, deleteTodo,
  getUserDeletionImpact,
  // Promotional Events
  listPromotionalEvents, getPromotionalEvent, createPromotionalEvent,
  updatePromotionalEvent, deletePromotionalEvent, togglePromotionalEventFeatured,
  togglePromotionalEventActive
} = require('../../controllers/adminController');

// All routes here are admin-only
router.use(protect, restrictTo('admin'));

// Overview / analytics
router.get('/overview', getOverview);

// Users
router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.get('/users/:id/deletion-impact', getUserDeletionImpact);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/verification', updateUserVerification);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

// Vendors
router.patch('/vendors/:id/flags', updateVendorFlags);
router.patch('/vendors/:id/halal', updateVendorHalal);

// Vendor Verification
router.get('/vendors/verification', listVendorsForVerification);
router.get('/vendors/selection', listVendorsForSelection);
router.patch('/vendors/:id/verification', updateVendorVerification);

// Events (Listings)
router.get('/events', listEvents);
router.post('/events', uploadInMemory.array('images', 10), createEventForVendor);
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

// Promotional Events
router.get('/promotional-events', listPromotionalEvents);
router.get('/promotional-events/:id', getPromotionalEvent);
router.post('/promotional-events', uploadInMemory.array('images', 10), createPromotionalEvent);
router.patch('/promotional-events/:id', updatePromotionalEvent);
router.delete('/promotional-events/:id', deletePromotionalEvent);
router.patch('/promotional-events/:id/featured', togglePromotionalEventFeatured);
router.patch('/promotional-events/:id/active', togglePromotionalEventActive);

module.exports = router;


