const User = require('../models/User');
const mongoose = require('mongoose');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all todo list tasks for a specific booked event
// @route   GET /api/todos/:bookingId
// @access  Private (Customer only)
exports.getAllTodos = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access todo lists'
    });
  }

  const userId = req.user.id;
  const { bookingId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid booking ID'
    });
  }

  // Find the user and get their booked events
  const user = await User.findById(userId).select('customerProfile.bookedEvents');

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Find the specific booked event
  const bookedEvent = user.customerProfile.bookedEvents.id(bookingId);

  if (!bookedEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Booked event not found'
    });
  }

  // Apply filters if provided
  let todoList = bookedEvent.todoList || [];

  // Filter by status if specified
  if (req.query.status && ['pending', 'completed'].includes(req.query.status)) {
    todoList = todoList.filter(todo => todo.status === req.query.status);
  }

  // Filter by priority if specified
  if (req.query.priority && ['low', 'medium', 'high'].includes(req.query.priority)) {
    todoList = todoList.filter(todo => todo.priority === req.query.priority);
  }

  // Sort by date (default: startDate ascending)
  const sortBy = req.query.sortBy || 'startDate';
  const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

  todoList.sort((a, b) => {
    if (sortBy === 'endDate') {
      return sortOrder * (new Date(a.endDate) - new Date(b.endDate));
    } else if (sortBy === 'createdAt') {
      return sortOrder * (new Date(a.createdAt) - new Date(b.createdAt));
    } else {
      return sortOrder * (new Date(a.startDate) - new Date(b.startDate));
    }
  });

  res.status(200).json({
    status: 'success',
    results: todoList.length,
    data: {
      bookingId,
      todoList
    }
  });
});

// @desc    Get a specific todo task by ID for a booked event
// @route   GET /api/todos/:bookingId/:todoId
// @access  Private (Customer only)
exports.getTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access todo tasks'
    });
  }

  const userId = req.user.id;
  const { bookingId, todoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(bookingId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid booking ID or todo ID'
    });
  }

  // Find the user
  const user = await User.findById(userId);

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Find the specific booked event
  const bookedEvent = user.customerProfile.bookedEvents.id(bookingId);

  if (!bookedEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Booked event not found'
    });
  }

  // Find the specific todo task
  const todo = bookedEvent.todoList.id(todoId);

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo task not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      bookingId,
      todo
    }
  });
});

// @desc    Create a new todo task for a booked event
// @route   POST /api/todos/:bookingId
// @access  Private (Customer only)
exports.createTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can create todo tasks'
    });
  }

  const userId = req.user.id;
  const { bookingId } = req.params;
  const { task, startDate, endDate, priority, notes } = req.body;

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid booking ID'
    });
  }

  // Validate required fields
  if (!task || !endDate) {
    return res.status(400).json({
      status: 'fail',
      message: 'Task description and end date are required'
    });
  }

  // Create new todo object
  const newTodo = {
    task,
    startDate: startDate || Date.now(),
    endDate,
    status: 'pending',
    priority: priority || 'medium',
    notes: notes || '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Find the user
  const user = await User.findById(userId);

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Find the specific booked event
  const bookedEvent = user.customerProfile.bookedEvents.id(bookingId);

  if (!bookedEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Booked event not found'
    });
  }

  // Initialize todoList array if it doesn't exist
  if (!bookedEvent.todoList) {
    bookedEvent.todoList = [];
  }

  // Add the new todo
  bookedEvent.todoList.push(newTodo);
  await user.save();

  // Get the newly created todo with its generated ID
  const createdTodo = bookedEvent.todoList[bookedEvent.todoList.length - 1];

  res.status(201).json({
    status: 'success',
    data: {
      bookingId,
      todo: createdTodo
    }
  });
});

// @desc    Update a todo task for a booked event
// @route   PATCH /api/todos/:bookingId/:todoId
// @access  Private (Customer only)
exports.updateTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can update todo tasks'
    });
  }

  const userId = req.user.id;
  const { bookingId, todoId } = req.params;
  const updates = req.body;

  if (!mongoose.Types.ObjectId.isValid(bookingId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid booking ID or todo ID'
    });
  }

  // Find the user
  const user = await User.findById(userId);

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Find the specific booked event
  const bookedEvent = user.customerProfile.bookedEvents.id(bookingId);

  if (!bookedEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Booked event not found'
    });
  }

  // Find the todo task to update
  const todo = bookedEvent.todoList.id(todoId);

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo task not found'
    });
  }

  // Update the todo task with the provided fields
  if (updates.task) todo.task = updates.task;
  if (updates.startDate) todo.startDate = updates.startDate;
  if (updates.endDate) todo.endDate = updates.endDate;
  if (updates.status && ['pending', 'completed'].includes(updates.status)) {
    todo.status = updates.status;
  }
  if (updates.priority && ['low', 'medium', 'high'].includes(updates.priority)) {
    todo.priority = updates.priority;
  }
  if (updates.notes !== undefined) todo.notes = updates.notes;

  // Update the updatedAt timestamp
  todo.updatedAt = Date.now();

  // Save the user document with the updated todo
  await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      bookingId,
      todo
    }
  });
});

// @desc    Delete a todo task for a booked event
// @route   DELETE /api/todos/:bookingId/:todoId
// @access  Private (Customer only)
exports.deleteTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can delete todo tasks'
    });
  }

  const userId = req.user.id;
  const { bookingId, todoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(bookingId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid booking ID or todo ID'
    });
  }

  // Find the user
  const user = await User.findById(userId);

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Find the specific booked event
  const bookedEvent = user.customerProfile.bookedEvents.id(bookingId);

  if (!bookedEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Booked event not found'
    });
  }

  // Find and remove the todo task
  const todoIndex = bookedEvent.todoList.findIndex(todo => todo._id.toString() === todoId);

  if (todoIndex === -1) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo task not found'
    });
  }

  // Remove the todo task
  bookedEvent.todoList.splice(todoIndex, 1);
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Todo task deleted successfully'
  });
});

module.exports = {
  getAllTodos: exports.getAllTodos,
  getTodo: exports.getTodo,
  createTodo: exports.createTodo,
  updateTodo: exports.updateTodo,
  deleteTodo: exports.deleteTodo
}; 