import { getDiscountedPrice, getFlashSaleProducts } from './FlashSale';

describe('flash sale helpers', () => {
  it('returns only products with a real discount and sorts by highest discount first', () => {
    const products = [
      { id: 1, name: 'A', price: 100000, discount: 0 },
      { id: 2, name: 'B', price: 200000, discount: 25 },
      { id: 3, name: 'C', price: 300000, discount: 10 },
      { id: 4, name: 'D', price: 400000, discount: 40 },
    ];

    const result = getFlashSaleProducts(products);

    expect(result.map((product) => product.id)).toEqual([4, 2, 3]);
    expect(result[0].discountedPrice).toBe(240000);
  });

  it('computes the discounted price from the base price and discount percent', () => {
    expect(getDiscountedPrice({ price: 500000, discount: 20 })).toBe(400000);
    expect(getDiscountedPrice({ price: 150000, discount: 0 })).toBe(150000);
  });
});
