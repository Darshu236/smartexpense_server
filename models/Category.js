// models/Category.js
import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['need', 'want'], default: 'need' },
    color: { type: String, default: '#8884d8' },
    icon: { type: String, default: 'Tag' }, // store lucide icon name or emoji
    monthlyBudget: { type: Number, default: 0 }, // 0 = no limit
    keywords: { type: [String], default: [] }, // used for auto-categorization
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// unique per user+name
CategorySchema.index({ user: 1, name: 1 }, { unique: true });

export default mongoose.model('Category', CategorySchema);
