const mongoose = require('mongoose');

async function connectDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/boardgamevn';
  const options = {
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
  };

  try {
    await mongoose.connect(uri, options);
    console.log('MongoDB connected');
    return true;
  } catch (error) {
    console.warn('MongoDB connection failed, using fallback data:', error.message);
    return false;
  }
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = {
  connectDb,
  isDbConnected,
};
