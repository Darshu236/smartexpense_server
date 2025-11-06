// server/config/connectDB.js
import mongoose from 'mongoose';

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('❌ MONGO_URI is missing in .env');
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected successfully');
};

export default connectDB;
