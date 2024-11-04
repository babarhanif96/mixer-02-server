const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const FeeSchema = new mongoose.Schema({
  depositFee: {
    type: Number,
    required: true,
  },
  withdrawalFee: {
    type: Number,
    required: true,
  },
  serviceFee: {
    type: Number,
    required: true,
  },
  anonymityFee: {
    type: Number,
    required: true,
  },
  adminAddress: {
    type: String,
    required: true,
  },
  mixerPrivateKey: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  verifyPassword: {
    type: String,
    required: true,
  },
}, { timestamps: true });

// Pre-save middleware to hash password and verifyPassword
FeeSchema.pre('save', async function (next) {
  // Hash password if it's modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password.toString(), salt);
  }

  // Hash verifyPassword if it's modified
  if (this.isModified('verifyPassword')) {
    const salt = await bcrypt.genSalt(10);
    this.verifyPassword = await bcrypt.hash(this.verifyPassword.toString(), salt);
  }

  next();
});

// Method to compare the main password
FeeSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword.toString(), this.password);
};

// Method to compare the verifyPassword
FeeSchema.methods.compareVerifyPassword = async function (candidateVerifyPassword) {
  return await bcrypt.compare(candidateVerifyPassword.toString(), this.verifyPassword);
};

// Static method to enforce single document creation
FeeSchema.statics.createFee = async function (feeData) {
  const existingFee = await this.findOne();
  if (existingFee) {
    throw new Error("A Fee document already exists. Only one document is allowed.");
  }
  return await this.create(feeData);
};

module.exports = mongoose.model('Fee', FeeSchema);
