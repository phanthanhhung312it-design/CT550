require('dotenv').config();

const Product = require('./models/Product');
const { connectDb } = require('./config/db');

async function run() {
  await connectDb();

  const testProduct = {
    id: 999,
    name: 'TEST Game Compass',
    category: 'Test',
    players: '1-2',
    age: '8+',
    price: 123000,
    rating: 4.2,
    reviews: 1,
    image: '🧪',
    labels: ['Test document', 'Compass check'],
    description: 'Document test để kiểm tra MongoDB Compass và API đã kết nối đúng chưa.',
  };

  const result = await Product.findOneAndUpdate(
    { id: testProduct.id },
    { $set: testProduct },
    { upsert: true, new: true }
  );

  console.log(`Saved test product with id=${result.id}`);
  await Product.db.close();
}

run().catch(async (error) => {
  console.error('Failed to add test document:', error);
  await Product.db.close();
  process.exit(1);
});