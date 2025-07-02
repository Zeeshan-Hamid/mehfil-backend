const User = require('../models/User');
const mongoose = require('mongoose');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all todo list tasks for the current user
// @route   GET /api/todos
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

  // Find the user and get their todo list
  const user = await User.findById(userId).select('customerProfile.todoList');

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Apply filters if provided
  let todoList = user.customerProfile.todoList || [];

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
      todoList
    }
  });
});

// @desc    Get a specific todo task by ID
// @route   GET /api/todos/:id
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
  const todoId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid todo ID'
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

  // Find the specific todo task
  const todo = user.customerProfile.todoList.id(todoId);

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo task not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      todo
    }
  });
});

// @desc    Create a new todo task
// @route   POST /api/todos
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
  const { task, startDate, endDate, priority, notes } = req.body;

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

  // Find the user and add the todo task
  const user = await User.findById(userId);

  if (!user || !user.customerProfile) {
    return res.status(404).json({
      status: 'fail',
      message: 'User not found or not a customer'
    });
  }

  // Initialize todoList array if it doesn't exist
  if (!user.customerProfile.todoList) {
    user.customerProfile.todoList = [];
  }

  // Add the new todo
  user.customerProfile.todoList.push(newTodo);
  await user.save();

  // Get the newly created todo with its generated ID
  const createdTodo = user.customerProfile.todoList[user.customerProfile.todoList.length - 1];

  res.status(201).json({
    status: 'success',
    data: {
      todo: createdTodo
    }
  });
});

// @desc    Update a todo task
// @route   PATCH /api/todos/:id
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
  const todoId = req.params.id;
  const updates = req.body;

  if (!mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid todo ID'
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

  // Find the todo task to update
  const todoIndex = user.customerProfile.todoList.findIndex(
    todo => todo._id.toString() === todoId
  );

  if (todoIndex === -1) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo task not found'
    });
  }

  // Update the todo task with the provided fields
  const todo = user.customerProfile.todoList[todoIndex];
  
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
      todo: user.customerProfile.todoList[todoIndex]
    }
  });
});

// @desc    Delete a todo task
// @route   DELETE /api/todos/:id
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
  const todoId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid todo ID'
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

  // Find the todo task index
  const todoIndex = user.customerProfile.todoList.findIndex(
    todo => todo._id.toString() === todoId
  );

  if (todoIndex === -1) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo task not found'
    });
  }

  // Remove the todo task
  user.customerProfile.todoList.splice(todoIndex, 1);
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