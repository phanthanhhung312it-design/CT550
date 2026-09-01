const { Schema, model } = require('mongoose');

const productSchema = new Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    players: { type: String, required: true },
    age: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    rating: { type: Number, required: true },
    reviews: { type: Number, required: true },
    image: { type: String, required: true },
    playTime: { type: String },
    publisher: { type: String },
    brand: { type: String },
    discount: { type: Number, default: 0 },
    labels: { type: [String], default: [] },
    description: { type: String, required: true },
    rank: { type: Number },
    ncc_ma: { type: Number },
    sp_ma: { type: Number },
    sp_ten: { type: String },
    sp_giaban: { type: Number },
    sp_soluong: { type: Number, default: 0 }
  },
  { timestamps: true, strict: false }
);

module.exports = model('Product', productSchema);
