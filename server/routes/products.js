const express = require('express');
const { createProduct, deleteProduct, getProductById, listBestSellerProducts, listProducts, updateProduct } = require('../services/productService');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const products = await listProducts();
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const product = await createProduct(req.body || {});
    res.status(201).json(product);
  } catch (error) {
    const statusCode = error.message.includes('đã tồn tại') ? 409 : 400;
    res.status(statusCode).json({ message: error.message || 'Không thể tạo sản phẩm.' });
  }
});

router.get('/best-sellers', async (req, res, next) => {
  try {
    const products = await listBestSellerProducts();
    res.json(JSON.parse(JSON.stringify(products)));
  } catch (error) {
    console.error('Failed to load best-sellers:', error);
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const product = await updateProduct(req.params.id, req.body || {});

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    const statusCode = error.message.includes('đã tồn tại') ? 409 : 400;
    res.status(statusCode).json({ message: error.message || 'Không thể cập nhật sản phẩm.' });
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteProduct(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
