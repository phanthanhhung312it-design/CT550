require('dotenv').config();

const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const User = require('./models/User');
const Product = require('./models/Product');
const BlogPost = require('./models/BlogPost');
const { connectDb } = require('./config/db');
const { products, blogPosts, orders, supportTips, users, employees, categories, brands } = require('./data/seedData');
const { managedCollections } = require('./data/mongoCollections');

function getCustomerUsers(list) {
  return list.filter((user) => String(user.role || '').toLowerCase() === 'customer');
}

async function resetCollection(model, documents) {
  const collectionName = model.collection.name;
  try {
    await mongoose.connection.collection(collectionName).drop();
  } catch (e) {
    // Collection might not exist yet
  }
  const collection = mongoose.connection.collection(collectionName);
  if (documents.length > 0) {
    await collection.insertMany(documents.map((doc) => ({
      ...doc,
      _id: new ObjectId(),
    })));
  }
}

async function seedProductsCollection(documents) {
  const collectionName = 'products';
  try {
    await mongoose.connection.collection(collectionName).drop();
  } catch (e) {
    // Collection might not exist yet
  }
  const collection = mongoose.connection.collection(collectionName);
  if (documents.length > 0) {
    await collection.insertMany(documents.map((doc) => ({
      ...doc,
      _id: doc.id,
    })));
  }
}

async function seedProductModel(documents) {
  const collection = mongoose.connection.collection(Product.collection.name);
  await collection.deleteMany({});
  if (documents.length > 0) {
    await collection.insertMany(documents.map((doc) => ({
      ...doc,
      _id: new ObjectId(),
    })));
  }
}

async function seedAdditionalCollection(collectionName, documents) {
  await mongoose.connection.db.createCollection(collectionName).catch(() => {});
  await mongoose.connection.collection(collectionName).deleteMany({});
  if (documents.length > 0) {
    await mongoose.connection.collection(collectionName).insertMany(documents);
  }
}

async function removeLegacyCollection(collectionName) {
  try {
    await mongoose.connection.collection(collectionName).drop();
  } catch (error) {
    if (error?.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }
}

async function run() {
  await connectDb();
  const shouldSeedManagedCollections = process.env.SEED_FULL_SCHEMA === 'true';
  const shouldSeedSampleOrders = process.env.SEED_SAMPLE_ORDERS === 'true';

  await resetCollection(User, getCustomerUsers(users));
  await seedAdditionalCollection('employees', employees);
  await seedAdditionalCollection('categories', categories);
  await seedAdditionalCollection('brands', brands);
  await seedAdditionalCollection('nhacungcap', managedCollections.nhacungcap || []);
  await seedProductsCollection(products);
  await resetCollection(BlogPost, blogPosts);
  if (shouldSeedSampleOrders) {
    await seedAdditionalCollection('orders', orders);
  }
  await seedAdditionalCollection('support_tips', supportTips.map((tip, index) => ({ id: index + 1, tip })));
  await removeLegacyCollection('customers');
  await removeLegacyCollection('nhanvien');
  if (shouldSeedManagedCollections) {
    for (const [collectionName, documents] of Object.entries(managedCollections)) {
      await seedAdditionalCollection(collectionName, documents);
    }
  }

  console.log('Seed completed successfully');
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Seed failed:', error);
  await mongoose.connection.close();
  process.exit(1);
});