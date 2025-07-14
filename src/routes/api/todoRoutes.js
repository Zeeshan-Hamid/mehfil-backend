const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const {
  getAllTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo
} = require('../../controllers/todoController');

// All todo routes require authentication and are restricted to customers
router.use(protect, restrictTo('customer'));

// Routes for todos within a specific booked event
router.route('/:bookingId')
  .get(getAllTodos)
  .post(createTodo);

// Routes for specific todo within a specific booked event
router.route('/:bookingId/:todoId')
  .get(getTodo)
  .patch(updateTodo)
  .delete(deleteTodo);

module.exports = router; 