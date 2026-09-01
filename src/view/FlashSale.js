import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProductsData } from './useBoardgameApi';
import ProductArtwork from './ProductArtwork';
import { addToCart } from './cartStorage';
import { toggleFavorite, useFavoriteItemsState } from './favoriteStorage';
import '../css/FlashSale.css';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ';
}

function getDiscountPercent(product) {
  const parsedValue = Number(product?.discount);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsedValue));
}

export function getDiscountedPrice(product) {
  if (Number.isFinite(Number(product?.currentPrice))) {
    return Number(product.currentPrice);
  }

  const price = Number(product?.originalPrice ?? product?.price ?? 0);
  const discountPercent = getDiscountPercent(product);
  return Math.round(price * (1 - discountPercent / 100));
}

export function getFlashSaleProducts(products) {
  return [...(Array.isArray(products) ? products : [])]
    .filter((product) => {
      const discountPercent = getDiscountPercent(product);
      const price = Number(product?.price || 0);
      return discountPercent > 0 && price > 0;
    })
    .map((product) => {
      const discountPercent = getDiscountPercent(product);
      const discountedPrice = getDiscountedPrice(product);
      const basePrice = Number(product?.originalPrice ?? product?.price ?? 0);

      return {
        ...product,
        discountPercent,
        discountedPrice,
        savings: Math.max(0, basePrice - discountedPrice),
      };
    })
    .sort((left, right) => (
      right.discountPercent - left.discountPercent
      || right.savings - left.savings
      || Number(left.price || 0) - Number(right.price || 0)
    ));
}

function FlashSale() {
  const products = useProductsData();
  const favoriteItems = useFavoriteItemsState();
  const [statusMessage, setStatusMessage] = useState('');
  const flashSaleProducts = useMemo(() => getFlashSaleProducts(products), [products]);
  const favoriteProductIds = useMemo(
    () => new Set(favoriteItems.map((item) => Number(item)).filter((item) => item > 0)),
    [favoriteItems]
  );

  useEffect(() => {
    document.title = 'Flash Sale | Board Game VN';
  }, []);

  function handleToggleFavorite(event, product) {
    event.preventDefault();
    event.stopPropagation();

    toggleFavorite(product.id).then((isFavorite) => {
      setStatusMessage(isFavorite ? `Đã thêm ${product.name} vào yêu thích.` : `Đã xóa ${product.name} khỏi yêu thích.`);
    });
  }

  function handleAddToCart(event, product) {
    event.preventDefault();
    event.stopPropagation();

    if (!Number(product?.stock || 0)) {
      setStatusMessage(`${product.name} hiện đã hết hàng.`);
      return;
    }

    addToCart(product.id, 1);
    setStatusMessage(`Đã thêm ${product.name} vào giỏ hàng.`);
  }

  return (
    <section className="card-surface flash-sale-page">
      <div className="section-heading flash-sale-heading">
        <div>
          <p className="eyebrow section-title-line">⚡ Flash Sale</p>
          <h2>Sản phẩm đang giảm giá</h2>
        </div>
        <Link className="secondary-button" to="/catalog">Khám phá thêm</Link>
      </div>

      {statusMessage ? <p className="flash-sale-status-toast">{statusMessage}</p> : null}

      <div className="flash-sale-panels">
        <article className="flash-sale-panel card-surface">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Ưu đãi hôm nay</p>
            </div>
          </div>

          <div className="flash-sale-grid">
            {flashSaleProducts.length > 0 ? flashSaleProducts.map((product) => {
              const isFavorite = favoriteProductIds.has(Number(product.id));
              const hasStock = Number(product.stock || 0) > 0;

              return (
                <article key={product.id} className="flash-sale-card">
                  <div className="flash-sale-badge-row">
                    <span className="flash-sale-badge">-{product.discountPercent}%</span>
                  </div>
                  <Link className="flash-sale-card-link-content" to={`/product/${product.id}`}>
                    <ProductArtwork product={product} className="flash-sale-image" imageClassName="flash-sale-image-content" />
                    <div className="flash-sale-body">
                      <span className="category-pill">{product.category}</span>
                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      <div className="flash-sale-meta-row">
                        <span>{product.players} người</span>
                        <span>{product.age}</span>
                        <span>{Number(product.rating || 0).toFixed(1)} ★</span>
                      </div>
                      <div className="flash-sale-tag-row">
                        {(Array.isArray(product.labels) ? product.labels : []).slice(0, 3).map((label) => (
                          <span key={`${product.id}-${label}`}>{label}</span>
                        ))}
                      </div>
                      <div className="flash-sale-price-stack">
                        <strong>{formatMoney(product.discountedPrice)}</strong>
                        <span>{formatMoney(Number(product.originalPrice ?? product.price ?? 0))}</span>
                      </div>
                      <span>Tiết kiệm {formatMoney(product.savings)}</span>
                    </div>
                  </Link>
                  <div className="flash-sale-card-actions">
                    <button
                      className={`flash-sale-action-button ${isFavorite ? 'active' : ''}`}
                      type="button"
                      onClick={(event) => handleToggleFavorite(event, product)}
                      aria-pressed={isFavorite}
                    >
                      <span className="flash-sale-action-icon" aria-hidden="true">{isFavorite ? '♥' : '♡'}</span>
                      {isFavorite ? 'Đã yêu thích' : 'Yêu thích'}
                    </button>
                    <button
                      className="flash-sale-action-button cart"
                      type="button"
                      onClick={(event) => handleAddToCart(event, product)}
                      disabled={!hasStock}
                    >
                      {hasStock ? 'Thêm vào giỏ' : 'Hết hàng'}
                    </button>
                  </div>
                </article>
              );
            }) : <p>Hiện chưa có sản phẩm nào đang giảm giá.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}

export default FlashSale;