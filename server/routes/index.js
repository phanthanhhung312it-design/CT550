const express = require('express');
const authRouter = require('./auth');
const adminRouter = require('./admin');
const productsRouter = require('./products');
const blogRouter = require('./blog');
const ordersRouter = require('./orders');
const rentalsRouter = require('./rentals');
const reviewsRouter = require('./reviews');
const chatbotRouter = require('./chatbot');
const vouchersRouter = require('./vouchers');
const accountRouter = require('./account');
const purchasesRouter = require('./purchases');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'boardgame-api' });
});

router.use('/auth', authRouter);
router.use('/admin', adminRouter);
router.use('/products', productsRouter);
router.use('/blog-posts', blogRouter);
router.use('/orders', ordersRouter);
router.use('/rentals', rentalsRouter);
router.use('/reviews', reviewsRouter);
router.use('/chatbot', chatbotRouter);
router.use('/vouchers', vouchersRouter);
router.use('/account', accountRouter);
router.use('/purchases', purchasesRouter);

module.exports = router;
