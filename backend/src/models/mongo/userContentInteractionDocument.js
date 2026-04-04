const mongoose = require('mongoose');

const userContentInteractionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    contentType: { type: String, required: true, default: 'movie' },
    itemId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    contextType: { type: String, default: 'relaxing' },
    timeOfDay: { type: String, default: 'dinner' },
    dayOfWeek: { type: Number, default: 0 },
    selected: { type: Boolean, default: false },
    action: { type: String, default: 'shown' },
    score: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    features: {
      genreMatch: { type: Number, default: 0 },
      moodMatch: { type: Number, default: 0 },
      durationFit: { type: Number, default: 0 },
      contextFit: { type: Number, default: 0 },
      timeOfDayFit: { type: Number, default: 0 },
      historySimilarity: { type: Number, default: 0 },
      activityFit: { type: Number, default: 0 },
    },
    metadata: { type: Object, default: {} },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

userContentInteractionSchema.index({ userId: 1, createdAt: -1 });
userContentInteractionSchema.index({ userId: 1, contentType: 1, createdAt: -1 });

module.exports =
  mongoose.models.UserContentInteractionDocument ||
  mongoose.model('UserContentInteractionDocument', userContentInteractionSchema);
