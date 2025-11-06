import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, trim: true },
    month: {
      type: String, 
      required: true,
      match: [/^\d{4}-\d{2}$/, 'month must be YYYY-MM'],
    },
    type: { type: String, enum: ['expense', 'income'], required: true },
    monthlyLimit: { type: Number, required: true, min: 1 },
    color: { type: String, default: '#D3D3D3' },
  },
  { timestamps: true }
);

budgetSchema.index({ user: 1, category: 1, month: 1, type: 1 }, { unique: true });

export default mongoose.model('Budget', budgetSchema);
