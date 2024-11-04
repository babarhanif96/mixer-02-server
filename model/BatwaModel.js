const mongoose = require('mongoose');

const batwaSchema = new mongoose.Schema(
  {
    recevierWallet:{ type: String, required: true },
    firstOne: {
      address: { type: String },
      key: { type: String }
    },
    secondOne: {
      address: { type: String },
      key: { type: String }
    },
    nextMixcer: {
      address: { type: String },
      key: { type: String }
    }
  },
  {
    timestamps: true 
  }
);

const Batwa = mongoose.model('Batwa', batwaSchema);
module.exports = Batwa;

