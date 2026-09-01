import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProductsData } from './useBoardgameApi';
import ProductArtwork from './ProductArtwork';
import { removeCartItem, updateCartItemQuantity, useCartItemsState } from './cartStorage';
import '../css/Cart.css';

function Cart() {
  const navigate = useNavigate();
  const products = useProductsData();
  const cartItems = useCartItemsState();

  useEffect(() => {
    document.title = 'Giỏ hàng | BoardGame Nexus';
  }, []);

  const cartProducts = useMemo(() => {
    return cartItems
      .map((cartItem) => {
        const product = products.find((item) => item.id === cartItem.productId);
        if (!product) {
          return null;
        }

        return {
          ...product,
          quantity: cartItem.quantity,
          lineTotal: product.price * cartItem.quantity,
        };
      })
      .filter(Boolean);
  }, [cartItems, products]);

  const cartTotal = cartProducts.reduce((total, item) => total + item.lineTotal, 0);

  function handleIncrease(productId, quantity) {
    updateCartItemQuantity(productId, quantity + 1);
  }

  function handleDecrease(productId, quantity) {
    updateCartItemQuantity(productId, quantity - 1);
  }

  function handleRemove(productId) {
    removeCartItem(productId);
  }

  return (
    <section className="cart-page">
      <article className="card-surface tracking-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow cart-eyebrow"><span className="cart-title-icon">🛒</span> Giỏ hàng</p>
            <h2>Danh sách các sản phẩm đã thêm</h2>
          </div>
          <Link className="secondary-button" to="/catalog">Tiếp tục mua sắm</Link>
        </div>

        {cartProducts.length > 0 ? (
          <div className="cart-list">
            {cartProducts.map((item, index) => (
              <div className="cart-item" key={`${item.id}-${index}`}>
                <ProductArtwork product={item} className="cart-item-image" />
                <div className="cart-item-info">
                  <strong>{item.name}</strong>
                  <span>{item.price.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="cart-item-quantity">
                  <button className="ghost-button" type="button" onClick={() => handleDecrease(item.id, item.quantity)}>-</button>
                  <span>{item.quantity}</span>
                  <button className="ghost-button" type="button" onClick={() => handleIncrease(item.id, item.quantity)}>+</button>
                </div>
                <div className="cart-item-total">
                  <strong>{item.lineTotal.toLocaleString('vi-VN')} đ</strong>
                </div>
                <button className="cart-remove-button" type="button" aria-label={`Xóa ${item.name}`} onClick={() => handleRemove(item.id)}>🗑</button>
              </div>
            ))}
          </div>
        ) : (
          <p>Giỏ hàng đang trống. Hãy thêm một sản phẩm để tiếp tục.</p>
        )}
      </article>

      <aside className="card-surface aside-card cart-summary-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Tổng tiền</p>
            <h3>Tổng tiền của từng sản phẩm</h3>
          </div>
        </div>
        <p className="cart-summary-total">{cartTotal.toLocaleString('vi-VN')} đ</p>
        <p>Hệ thống cập nhật tức thì khi bạn tăng hoặc giảm số lượng.</p>
        <button className="primary-button full-width" type="button" onClick={() => navigate('/checkout')} disabled={cartProducts.length === 0}>
          Thanh toán
        </button>
      </aside>
    </section>
  );
}

export default Cart;