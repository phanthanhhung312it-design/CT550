import { applyVoucher, normalizeVoucherItem, resolveVoucherErrorMessage } from './voucherUtils';

describe('voucherUtils', () => {
  test('applies percentage discount within max discount', () => {
    const voucher = normalizeVoucherItem({
      code: 'SAVE10',
      discountType: 1,
      value: 10,
      maxDiscount: 50000,
      minAmount: 100000,
    });

    expect(applyVoucher(500000, voucher)).toBe(50000);
  });

  test('returns exact amount for fixed discount vouchers', () => {
    const voucher = normalizeVoucherItem({
      code: 'SAVE50K',
      discountType: 2,
      value: 50000,
      minAmount: 100000,
    });

    expect(applyVoucher(300000, voucher)).toBe(50000);
  });

  test('maps invalid voucher messages to user-facing text', () => {
    expect(resolveVoucherErrorMessage('Mã voucher không tồn tại.')).toBe('Không có mã voucher này');
    expect(resolveVoucherErrorMessage('Voucher đã hết hạn.')).toBe('Voucher đã hết hạn.');
  });
});
