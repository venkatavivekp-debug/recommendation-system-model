const mongoose = require('mongoose');

const calendarPlanSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    plannedCalories: { type: Number, required: true },
    expectedExtraCalories: { type: Number, default: 0 },
    reductionPerDay: { type: Number, default: 0 },
    planningWindowDays: { type: Number, default: 0 },
    isCheatDay: { type: Boolean, default: false },
    suggestions: { type: [String], default: [] },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.CalendarPlanDocument || mongoose.model('CalendarPlanDocument', calendarPlanSchema);
