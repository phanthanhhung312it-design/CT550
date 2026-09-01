const test = require('node:test');
const assert = require('node:assert/strict');

const { validatePurchaseItems, summarizePurchaseTotal } = require('../services/purchaseService');

test('validatePurchaseItems rejects empty or invalid data', () => {
  const result = validatePurchaseItems([]);
  assert.equal(result.isValid, false);
  assert.match(result.message, /ít nhất một sản phẩm/i);
});

test('validatePurchaseItems rejects negative price and invalid quantity', () => {
  const result = validatePurchaseItems([
    { productId: 1, quantity: 0, unitPrice: -1000 },
  ]);

  assert.equal(result.isValid, false);
  assert.match(result.message, /lớn hơn 0|không được âm/i);
});

test('summarizePurchaseTotal sums item totals correctly', () => {
  const total = summarizePurchaseTotal([
    { quantity: 10, unitPrice: 350000 },
    { quantity: 20, unitPrice: 85000 },
  ]);

  assert.equal(total, 5200000);
});
