const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    keyword: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radius: { type: Number, required: true },
    resultCount: { type: Number, required: true },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.SearchHistoryDocument ||
  mongoose.model('SearchHistoryDocument', searchHistorySchema);
