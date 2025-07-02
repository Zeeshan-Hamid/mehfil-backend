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

// Get all todos and create a new todo
router.route('/')
  .get(getAllTodos)
  .post(createTodo);

// Get, update, and delete a specific todo
router.route('/:id')
  .get(getTodo)
  .patch(updateTodo)
  .delete(deleteTodo);

module.exports = router; 