const mongoose = require('mongoose');

const searchLogSchema = new mongoose.Schema({
  query: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['search', 'suggestion_click'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Index for efficient querying by timestamp and query
searchLogSchema.index({ timestamp: -1 });
searchLogSchema.index({ query: 'text' });

module.exports = searchLogSchema;
