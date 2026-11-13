require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectDb, isDbConnected } = require('./config/db');
const apiRouter = require('./routes');
const accountRouter = require('./routes/account');
const { recomputeMembershipPoints } = require('./services/membershipService');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: isDbConnected() ? 'connected' : 'disconnected' });
});
app.use('/api/account', accountRouter);
app.use('/api', apiRouter);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
});

async function startServer() {
  const connected = await connectDb();

  if (connected) {
    try {
      const usersUpdated = await recomputeMembershipPoints();
      console.log(`Membership points recomputed for ${usersUpdated} users.`);
    } catch (err) {
      console.warn('Failed to recompute membership points on startup:', err.message || err);
    }
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
