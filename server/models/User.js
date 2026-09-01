const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    displayName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    passwordHash: { type: String },
    membershipPoints: { type: Number, default: 0 },
    role: { type: String, required: true, enum: ['customer'] },
    isLocked: { type: Boolean, default: false },
    avatar: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);