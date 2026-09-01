require('dotenv').config();

const Product = require('./models/Product');
const { connectDb } = require('./config/db');

async function run() {
  await connectDb();

  const newProduct = {
    id: 1000,
    name: 'Carcassonne',
    category: 'Chiến lược',
    players: '2-5',
    age: '7+',
    price: 690000,
    rating: 4.8,
    reviews: 145,
    image: '/image/carcassonne.jpg',
    labels: ['Mới thêm', 'Chiến thuật'],
    description: 'Xây thành phố, nông trại và con đường bằng cách ghép các mảnh bản đồ để mở rộng lãnh thổ.',
  };

  const result = await Product.findOneAndUpdate(
    { id: newProduct.id },
    { $set: newProduct },
    { upsert: true, new: true }
  );

  console.log(`Saved new product with id=${result.id}`);
  await Product.db.close();
}

run().catch(async (error) => {
  console.error('Failed to add new product:', error);
  await Product.db.close();
  process.exit(1);
});