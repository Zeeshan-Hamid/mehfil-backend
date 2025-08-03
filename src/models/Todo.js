const mongoose = require('mongoose');

const todoSchema = new mongoose.Schema({
  userEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserEvent',
    required: [true, 'User event is required'],
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  taskName: {
    type: String,
    required: [true, 'Task name is required'],
    trim: true,
    maxlength: [200, 'Task name cannot exceed 200 characters']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  member: {
    type: String,
    trim: true,
    maxlength: [100, 'Member name cannot exceed 100 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
todoSchema.index({ userEvent: 1, createdAt: -1 });
todoSchema.index({ user: 1, status: 1 });
todoSchema.index({ userEvent: 1, status: 1 });
todoSchema.index({ dueDate: 1 });
todoSchema.index({ priority: 1 });

// Virtual for overdue status
todoSchema.virtual('isOverdue').get(function() {
  if (!this.endDate || this.isCompleted) return false;
  return new Date() > this.endDate;
});

// Virtual for days until due
todoSchema.virtual('daysUntilDue').get(function() {
  if (!this.endDate) return null;
  const now = new Date();
  const due = new Date(this.endDate);
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Pre-save middleware to update completedAt when status changes
todoSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
    this.isCompleted = true;
  } else if (this.isModified('status') && this.status !== 'completed') {
    this.completedAt = undefined;
    this.isCompleted = false;
  }
  next();
});

// Post-save middleware to update event task counts
todoSchema.post('save', async function() {
  const UserEvent = require('./UserEvent');
  const Todo = require('./Todo');
  
  try {
    // Count total todos and completed todos for this event
    const totalTodos = await Todo.countDocuments({ userEvent: this.userEvent });
    const completedTodos = await Todo.countDocuments({ 
      userEvent: this.userEvent, 
      status: 'completed' 
    });
    
    // Update the user event with new task counts
    await UserEvent.findByIdAndUpdate(this.userEvent, {
      tasksTotal: totalTodos,
      tasksDone: completedTodos
    });
  } catch (error) {
    console.error('Error updating event task counts:', error);
  }
});

// Post-remove middleware to update event task counts
todoSchema.post('remove', async function() {
  const UserEvent = require('./UserEvent');
  const Todo = require('./Todo');
  
  try {
    // Count total todos and completed todos for this event
    const totalTodos = await Todo.countDocuments({ userEvent: this.userEvent });
    const completedTodos = await Todo.countDocuments({ 
      userEvent: this.userEvent, 
      status: 'completed' 
    });
    
    // Update the user event with new task counts
    await UserEvent.findByIdAndUpdate(this.userEvent, {
      tasksTotal: totalTodos,
      tasksDone: completedTodos
    });
  } catch (error) {
    console.error('Error updating event task counts:', error);
  }
});

const Todo = mongoose.model('Todo', todoSchema);

module.exports = Todo; 