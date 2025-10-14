const express = require('express');
const router = express.Router();
const userEventController = require('../../controllers/userEventController');
const eventTodoController = require('../../controllers/eventTodoController');
const { protect } = require('../../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(protect);

// User Event routes
router.route('/')
  .get(userEventController.getAllUserEvents)
  .post(userEventController.createUserEvent);

// AI-powered event creation
router.route('/ai-create')
  .post(userEventController.createAIEvent);

router.route('/stats')
  .get(userEventController.getEventStats);

router.route('/:id')
  .get(userEventController.getUserEvent)
  .put(userEventController.updateUserEvent)
  .delete(userEventController.deleteUserEvent);



// Priority todos route (for dashboard)
router.route('/todos/priority')
  .get(eventTodoController.getPriorityTodos);

// Event Todo routes
router.route('/:eventId/todos')
  .get(eventTodoController.getEventTodos)
  .post(eventTodoController.createEventTodo);

router.route('/:eventId/todos/stats')
  .get(eventTodoController.getEventTodoStats);

router.route('/:eventId/todos/:todoId')
  .get(eventTodoController.getEventTodo)
  .put(eventTodoController.updateEventTodo)
  .delete(eventTodoController.deleteEventTodo);

router.route('/:eventId/todos/:todoId/toggle')
  .patch(eventTodoController.toggleTodoCompletion);

module.exports = router; 