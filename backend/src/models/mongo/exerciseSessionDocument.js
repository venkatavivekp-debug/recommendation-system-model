const mongoose = require('mongoose');

const exerciseEntrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sets: { type: Number, default: 0 },
    reps: { type: Number, default: 0 },
    weightKg: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    intensity: { type: String, default: 'moderate' },
    met: { type: Number, default: 0 },
    caloriesBurned: { type: Number, default: 0 },
  },
  { _id: false }
);

const exerciseSessionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    workoutType: { type: String, required: true, index: true },
    source: { type: String, default: 'manual' },
    provider: { type: String, default: 'manual' },
    bodyWeightKg: { type: Number, required: true },
    durationMinutes: { type: Number, default: 0 },
    exercises: { type: [exerciseEntrySchema], default: [] },
    steps: { type: Number, default: 0 },
    distanceMiles: { type: Number, default: 0 },
    caloriesBurned: { type: Number, default: 0 },
    estimationMethod: { type: String, default: 'met_formula' },
    notes: { type: String, default: '' },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.ExerciseSessionDocument ||
  mongoose.model('ExerciseSessionDocument', exerciseSessionSchema);
