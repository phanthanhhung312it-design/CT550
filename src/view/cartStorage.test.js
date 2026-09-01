import { getCartItems } from './cartStorage';
import { clearAuthUser, setAuthUser } from './auth';

describe('cart storage per authenticated user', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAuthUser();
  });

  it('does not reuse the previous account cart after switching accounts', () => {
    setAuthUser({ token: 'token-1', user: { id: 1, role: 'customer' } });
    localStorage.setItem('boardgamevn-cart:1', JSON.stringify([{ productId: 10, quantity: 2 }]));

    expect(getCartItems()).toEqual([{ productId: 10, quantity: 2 }]);

    setAuthUser({ token: 'token-2', user: { id: 2, role: 'customer' } });

    expect(getCartItems()).toEqual([]);

    localStorage.setItem('boardgamevn-cart:2', JSON.stringify([{ productId: 20, quantity: 1 }]));
    expect(getCartItems()).toEqual([{ productId: 20, quantity: 1 }]);
  });

  it('returns an empty cart for admin and staff accounts', () => {
    setAuthUser({ token: 'token-admin', user: { id: 99, role: 'admin' } });
    localStorage.setItem('boardgamevn-cart:99', JSON.stringify([{ productId: 10, quantity: 2 }]));

    expect(getCartItems()).toEqual([]);
  });
});
