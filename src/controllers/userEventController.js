const UserEvent = require('../models/UserEvent');
const Todo = require('../models/Todo');
const mongoose = require('mongoose');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all user events for a customer
// @route   GET /api/user-events
// @access  Private (Customer only)
exports.getAllUserEvents = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access user events'
    });
  }

  const userId = req.user.id;
  const { status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  // Build query
  const query = { user: userId };
  if (status && ['Active', 'Completed', 'Cancelled', 'Postponed'].includes(status)) {
    query.status = status;
  }

  // Build sort object
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const userEvents = await UserEvent.find(query)
    .sort(sortOptions)
    .select('-__v');

  res.status(200).json({
    status: 'success',
    results: userEvents.length,
    data: {
      userEvents
    }
  });
});

// @desc    Get a specific user event
// @route   GET /api/user-events/:id
// @access  Private (Customer only)
exports.getUserEvent = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access user events'
    });
  }

  const userId = req.user.id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid user event ID'
    });
  }

  const userEvent = await UserEvent.findOne({ _id: id, user: userId });

  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'User event not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      userEvent
    }
  });
});

// @desc    Create a new user event
// @route   POST /api/user-events
// @access  Private (Customer only)
exports.createUserEvent = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can create user events'
    });
  }

  const userId = req.user.id;
  const eventData = {
    ...req.body,
    user: userId
  };

  // Validate custom event type
  if (eventData.isCustomEvent && !eventData.customEventType) {
    return res.status(400).json({
      status: 'fail',
      message: 'Custom event type name is required when creating a custom event'
    });
  }

  const userEvent = await UserEvent.create(eventData);

  res.status(201).json({
    status: 'success',
    data: {
      userEvent
    }
  });
});

// @desc    Update a user event
// @route   PUT /api/user-events/:id
// @access  Private (Customer only)
exports.updateUserEvent = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can update user events'
    });
  }

  const userId = req.user.id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid user event ID'
    });
  }

  // Validate custom event type
  if (req.body.isCustomEvent && !req.body.customEventType) {
    return res.status(400).json({
      status: 'fail',
      message: 'Custom event type name is required when creating a custom event'
    });
  }

  const userEvent = await UserEvent.findOneAndUpdate(
    { _id: id, user: userId },
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'User event not found'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      userEvent
    }
  });
});

// @desc    Delete a user event
// @route   DELETE /api/user-events/:id
// @access  Private (Customer only)
exports.deleteUserEvent = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can delete user events'
    });
  }

  const userId = req.user.id;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid user event ID'
    });
  }

  // Delete associated todos first
  await Todo.deleteMany({ userEvent: id, user: userId });

  const userEvent = await UserEvent.findOneAndDelete({ _id: id, user: userId });

  if (!userEvent) {
    return res.status(404).json({
      status: 'fail',
      message: 'User event not found'
    });
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// Helper function to calculate start date based on timeline phase
const calculateStartDate = (eventDate, timelinePhase) => {
  const event = new Date(eventDate);
  const phases = {
    '6+ months before': 6 * 30, // 6 months in days
    '3-6 months before': 4.5 * 30, // 4.5 months in days
    '1-3 months before': 2 * 30, // 2 months in days
    '1 month before': 30, // 1 month in days
    '1-2 weeks before': 10, // 1.5 weeks in days
    '1 week before': 7, // 1 week in days
    'Day of event': 0 // Same day
  };
  
  const daysBefore = phases[timelinePhase] || 30;
  const startDate = new Date(event);
  startDate.setDate(startDate.getDate() - daysBefore);
  return startDate;
};

// @desc    Create AI-powered event with checklist
// @route   POST /api/user-events/ai-create
// @access  Private (Customer only)
exports.createAIEvent = catchAsync(async (req, res) => {
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can create user events'
    });
  }

  const { eventData, checklist } = req.body;
  
  // Create the event
  const userEvent = await UserEvent.create({
    ...eventData,
    user: req.user.id,
    aiGenerated: true,
    checklistCategories: checklist.categories
  });

  // Create todos from checklist categories
  const todos = [];
  for (const category of checklist.categories) {
    for (const task of category.tasks) {
      const todo = await Todo.create({
        userEvent: userEvent._id,
        user: req.user.id,
        taskName: task.taskName,
        category: category.name,
        timelinePhase: task.timelinePhase,
        priority: task.priority,
        description: task.description,
        startDate: calculateStartDate(eventData.date, task.timelinePhase),
        endDate: new Date(eventData.date),
        aiGenerated: true
      });
      todos.push(todo);
    }
  }

  res.status(201).json({
    status: 'success',
    data: {
      userEvent,
      todos
    }
  });
});

// @desc    Get event statistics
// @route   GET /api/user-events/stats
// @access  Private (Customer only)
exports.getEventStats = catchAsync(async (req, res) => {
  // Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can access event statistics'
    });
  }

  const userId = req.user.id;

  const stats = await UserEvent.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        activeEvents: {
          $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
        },
        completedEvents: {
          $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] }
        },
        totalBudget: { $sum: '$budget' },
        totalGuests: { $sum: '$guests' },
        totalTasksDone: { $sum: '$tasksDone' },
        totalTasksTotal: { $sum: '$tasksTotal' }
      }
    }
  ]);

  const eventStats = stats[0] || {
    totalEvents: 0,
    activeEvents: 0,
    completedEvents: 0,
    totalBudget: 0,
    totalGuests: 0,
    totalTasksDone: 0,
    totalTasksTotal: 0
  };

  res.status(200).json({
    status: 'success',
    data: {
      stats: eventStats
    }
  });
}); 