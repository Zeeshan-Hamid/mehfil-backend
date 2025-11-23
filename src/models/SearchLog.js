const mongoose = require('mongoose');
const searchLogSchema = require('./schemas/SearchLog');

const SearchLog = mongoose.model('SearchLog', searchLogSchema);

module.exports = SearchLog;
