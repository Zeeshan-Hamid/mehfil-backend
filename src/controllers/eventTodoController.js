const Todo = require('../models/Todo');
const UserEvent = require('../models/UserEvent');
const mongoose = require('mongoose');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all todos for a specific user event
// @route   GET /api/user-events/:eventId/todos
// @access  Private (Customer only)
exports.getEventTodos = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access event todos'
    });
  }

  const userId = req.user.id;
  const { eventId } = req.params;
  const { status, priority, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  // Build query
  const query = { userEvent, user: userId };
  if (status && ['pending', 'in-progress', 'completed'].includes(status)) {
    query.status = status;
  }

  // Build sort object
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const todos = await Todo.find(query)
    .sort(sortOptions)
    .select('-__v');

  res.status(200).json({
    status: 'success',
    results: todos.length,
    data: {
      eventId,
      todos
    }
  });
});

// @desc    Get a specific todo
// @route   GET /api/user-events/:eventId/todos/:todoId
// @access  Private (Customer only)
exports.getEventTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access event todos'
    });
  }

  const userId = req.user.id;
  const { eventId, todoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID or todo ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const todo = await Todo.findOne({ _id: todoId, userEvent, user: userId });

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      todo
    }
  });
});

// @desc    Create a new todo for an event
// @route   POST /api/user-events/:eventId/todos
// @access  Private (Customer only)
exports.createEventTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can create event todos'
    });
  }

  const userId = req.user.id;
  const { eventId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const todoData = {
    ...req.body,
    userEvent,
    user: userId
  };

  const todo = await Todo.create(todoData);

  res.status(201).json({
    status: 'success',
    data: {
      todo
    }
  });
});

// @desc    Update a todo
// @route   PUT /api/user-events/:eventId/todos/:todoId
// @access  Private (Customer only)
exports.updateEventTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can update event todos'
    });
  }

  const userId = req.user.id;
  const { eventId, todoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID or todo ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const todo = await Todo.findOneAndUpdate(
    { _id: todoId, userEvent, user: userId },
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      todo
    }
  });
});

// @desc    Delete a todo
// @route   DELETE /api/user-events/:eventId/todos/:todoId
// @access  Private (Customer only)
exports.deleteEventTodo = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can delete event todos'
    });
  }

  const userId = req.user.id;
  const { eventId, todoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID or todo ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const todo = await Todo.findOneAndDelete({ _id: todoId, userEvent, user: userId });

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo not found'
    });
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// @desc    Toggle todo completion status
// @route   PATCH /api/user-events/:eventId/todos/:todoId/toggle
// @access  Private (Customer only)
exports.toggleTodoCompletion = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can toggle todo completion'
    });
  }

  const userId = req.user.id;
  const { eventId, todoId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(todoId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID or todo ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const todo = await Todo.findOne({ _id: todoId, userEvent, user: userId });

  if (!todo) {
    return res.status(404).json({
      status: 'fail',
      message: 'Todo not found'
    });
  }

  // Toggle completion status
  todo.status = todo.status === 'completed' ? 'pending' : 'completed';
  if (todo.status === 'completed') {
    todo.completedAt = new Date();
    todo.isCompleted = true;
  } else {
    todo.completedAt = undefined;
    todo.isCompleted = false;
  }

  await todo.save();

  res.status(200).json({
    status: 'success',
    data: {
      todo
    }
  });
});

// @desc    Get todo statistics for an event
// @route   GET /api/user-events/:eventId/todos/stats
// @access  Private (Customer only)
exports.getEventTodoStats = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access todo statistics'
    });
  }

  const userId = req.user.id;
  const { eventId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid event ID'
    });
  }

  // Verify the event belongs to the user
  const userEvent = await UserEvent.findOne({ _id: eventId, user: userId });
  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'Event not found'
    });
  }

  const stats = await Todo.aggregate([
    { $match: { userEvent: mongoose.Types.ObjectId(eventId), user: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalTodos: { $sum: 1 },
        completedTodos: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        pendingTodos: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        inProgressTodos: {
          $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
        },
        overdueTodos: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'completed'] },
                  { $lt: ['$endDate', new Date()] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  const todoStats = stats[0] || {
    totalTodos: 0,
    completedTodos: 0,
    pendingTodos: 0,
    inProgressTodos: 0,
    overdueTodos: 0
  };

  // Calculate completion percentage
  todoStats.completionPercentage = todoStats.totalTodos > 0 
    ? Math.round((todoStats.completedTodos / todoStats.totalTodos) * 100) 
    : 0;

  res.status(200).json({
    status: 'success',
    data: {
      eventId,
      stats: todoStats
    }
  });
});

// @desc    Get top 3 high priority todos for dashboard
// @route   GET /api/user-events/todos/priority
// @access  Private (Customer only)
exports.getPriorityTodos = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access priority todos'
    });
  }

  const userId = req.user.id;

  // Get top 3 todos with nearest end dates that are not completed
  const priorityTodos = await Todo.find({
    user: userId,
    status: { $ne: 'completed' }
  })
  .populate('userEvent', 'title icon')
  .sort({ endDate: 1 }) // Sort by end date ascending (nearest first)
  .limit(3)
  .select('-__v');

  res.status(200).json({
    status: 'success',
    results: priorityTodos.length,
    data: {
      priorityTodos
    }
  });
}); 