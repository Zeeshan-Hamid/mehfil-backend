const mongoose = require('mongoose');

const userEventSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxlength: [200, 'Event title cannot exceed 200 characters']
  },
  date: {
    type: Date,
    required: [true, 'Event date is required']
  },
  location: {
    type: String,
    required: [true, 'Event location is required'],
    trim: true,
    maxlength: [500, 'Event location cannot exceed 500 characters']
  },
  guests: {
    type: Number,
    default: 0,
    min: [0, 'Number of guests cannot be negative']
  },
  tasksDone: {
    type: Number,
    default: 0,
    min: [0, 'Tasks done cannot be negative']
  },
  tasksTotal: {
    type: Number,
    default: 0,
    min: [0, 'Total tasks cannot be negative']
  },
  budget: {
    type: Number,
    default: 0,
    min: [0, 'Budget cannot be negative']
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Cancelled', 'Postponed'],
    default: 'Active'
  },
  icon: {
    type: String,
    default: '🎉',
    enum: ['🎉', '👰', '🎂', '🎓', '🏢', '🎯']
  },
  isCustomEvent: {
    type: Boolean,
    default: false
  },
  customEventType: {
    type: String,
    trim: true,
    maxlength: [100, 'Custom event type cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Event description cannot exceed 2000 characters']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Event notes cannot exceed 5000 characters']
  },
  eventType: {
    type: String,
    enum: ['Wedding', 'Birthday', 'Graduation', 'Corporate', 'Engagement', 'Anniversary', 'Other'],
    default: 'Other'
  },
  theme: {
    type: String,
    trim: true,
    maxlength: [200, 'Theme cannot exceed 200 characters']
  },
  specialRequirements: {
    type: [String],
    default: []
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  checklistCategories: {
    type: [{
      name: String,
      icon: String,
      tasks: [{
        taskName: String,
        timelinePhase: String,
        priority: {
          type: String,
          enum: ['high', 'medium', 'low'],
          default: 'medium'
        },
        description: String
      }]
    }],
    default: []
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userEventSchema.index({ user: 1, createdAt: -1 });
userEventSchema.index({ user: 1, status: 1 });
userEventSchema.index({ user: 1, date: 1 });
userEventSchema.index({ status: 1 });

// Virtual for formatted date
userEventSchema.virtual('formattedDate').get(function() {
  if (!this.date) return '';
  return this.date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
});

// Virtual for task completion percentage
userEventSchema.virtual('taskCompletionPercentage').get(function() {
  if (this.tasksTotal === 0) return 0;
  return Math.round((this.tasksDone / this.tasksTotal) * 100);
});

// Pre-save middleware to validate custom event type
userEventSchema.pre('save', function(next) {
  if (this.isCustomEvent && !this.customEventType) {
    return next(new Error('Custom event type name is required when isCustomEvent is true'));
  }
  next();
});

const UserEvent = mongoose.model('UserEvent', userEventSchema);

module.exports = UserEvent; 