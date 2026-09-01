'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOrderStatus, isCompletedOrderStatus } = require('../utils/orderStatus');
const { getCompletedOrderStockDelta, getOrderStatusStockDelta } = require('../utils/orderInventory');

test('normalizeOrderStatus recognizes delivered and completed statuses as completed', () => {
  const completedStatuses = ['Hoàn thành', 'Hoàn tất', 'Đã giao', 'Giao thành công', 'completed', 'done'];

  for (const status of completedStatuses) {
    assert.equal(normalizeOrderStatus(status), 'Hoàn thành');
    assert.equal(isCompletedOrderStatus(status), true);
  }
});

test('normalizeOrderStatus keeps shipping states separate from completed states', () => {
  assert.equal(normalizeOrderStatus('Đang giao'), 'Đang giao');
  assert.equal(isCompletedOrderStatus('Đang giao'), false);
  assert.equal(normalizeOrderStatus('Chờ xác nhận'), 'Chờ xác nhận');
  assert.equal(isCompletedOrderStatus('Chờ xác nhận'), false);
});

test('getCompletedOrderStockDelta subtracts quantities for completed orders', () => {
  const delta = getCompletedOrderStockDelta({
    items: [
      { productId: 7, quantity: 2 },
      { id: 12, quantity: 1 },
      { sp_ma: 7, ctdh_soluong: 2 },
    ],
  });

  assert.deepEqual([...delta.entries()].sort(([left], [right]) => left - right), [[7, -4], [12, -1]]);
});

test('getOrderStatusStockDelta restores stock when status is changed away from completion', () => {
  const delta = getOrderStatusStockDelta(
    { items: [{ productId: 9, quantity: 3 }] },
    'Hoàn thành',
    'Đang giao'
  );

  assert.deepEqual([...delta.entries()], [[9, 3]]);
});
