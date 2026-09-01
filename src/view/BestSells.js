import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBestSellerProducts } from './useBoardgameApi';
import { addToCart } from './cartStorage';
import ProductArtwork from './ProductArtwork';
import '../css/BestSells.css';

const topSellerCount = 10;
const priceFilterOptions = {
  all: [0, Number.POSITIVE_INFINITY],
  under500: [0, 500000],
  from500to900: [500000, 900000],
  above900: [900000, Number.POSITIVE_INFINITY],
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function getRankBadgeClass(rank) {
  const normalizedRank = Number(rank || 0);

  if (normalizedRank === 1) {
    return 'rank-badge rank-badge-top1';
  }

  if (normalizedRank === 2) {
    return 'rank-badge rank-badge-top2';
  }

  return 'rank-badge';
}

function BestSells() {
  const bestSellerProducts = useBestSellerProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tất cả');
  const [priceFilter, setPriceFilter] = useState('all');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    document.title = 'Best Sells | Board Game VN';
  }, []);

  const categoryOptions = useMemo(
    () => ['Tất cả', ...new Set(bestSellerProducts.map((product) => product.category).filter(Boolean))],
    [bestSellerProducts]
  );

  const visibleProducts = useMemo(() => {
    const query = normalizeText(searchTerm);
    const [minPrice, maxPrice] = priceFilterOptions[priceFilter] || priceFilterOptions.all;

    return [...bestSellerProducts]
      .filter((product) => {
        const productName = normalizeText(product.name);
        const matchesSearch = !query || productName.includes(query);
        const matchesCategory = categoryFilter === 'Tất cả' || product.category === categoryFilter;
        const productPrice = Number(product.price || 0);
        const matchesPrice = productPrice >= minPrice && productPrice <= maxPrice;
        return matchesSearch && matchesCategory && matchesPrice;
      })
      .sort((left, right) => Number(left.rank || 0) - Number(right.rank || 0))
      .slice(0, topSellerCount);
  }, [bestSellerProducts, categoryFilter, priceFilter, searchTerm]);

  function handleAddToCart(product) {
    if (!Number(product?.stock || 0)) {
      return;
    }

    addToCart(product.id, 1);
    setNotice(`Đã thêm ${product.name} vào giỏ hàng.`);
  }

  return (
    <section className="card-surface bestsells-page">
      <div className="section-heading bestsells-heading">
        <div>
          <p className="eyebrow section-title-line">🔥 HÀNG HOT — BEST SELLERS</p>
          <h2>Xếp hạng các game đang bán chạy nhất</h2>
        </div>
        <Link className="secondary-button" to="/catalog">Xem thêm toàn bộ game</Link>
      </div>

      <div className="bestsells-tools">
        <label className="bestsells-tool-item" htmlFor="bestseller-search">
          Tìm theo tên
          <input
            id="bestseller-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Ví dụ: Catan, Azul..."
          />
        </label>
        <label className="bestsells-tool-item" htmlFor="bestseller-category">
          Danh mục
          <select id="bestseller-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="bestsells-tool-item" htmlFor="bestseller-price">
          Khoảng giá
          <select id="bestseller-price" value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="under500">Dưới 500.000 đ</option>
            <option value="from500to900">500.000 đ - 900.000 đ</option>
            <option value="above900">Trên 900.000 đ</option>
          </select>
        </label>
      </div>

      {notice ? <p className="bestsells-notice">{notice}</p> : null}

      {visibleProducts.length === 0 ? (
        <div className="bestsells-empty">
          <h3>Chưa có dữ liệu Best Sellers phù hợp</h3>
          <p>Dữ liệu được lấy trực tiếp từ đơn hàng hoàn thành trong cơ sở dữ liệu. Hãy thử đổi bộ lọc hoặc quay lại sau.</p>
        </div>
      ) : null}

      <div className="rank-list">
        {visibleProducts.map((product) => (
          <article className="rank-card" key={product.id}>
            <div className={getRankBadgeClass(product.rank)}>
              {Number(product.rank || 0) === 1 || Number(product.rank || 0) === 2 ? <span className="rank-crown" aria-hidden="true">👑</span> : null}
              <span className="rank-badge-text">Top {Number(product.rank || 0)}</span>
            </div>
            <ProductArtwork product={product} className="rank-icon" />
            <div className="rank-body">
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <div className="rank-sales-row">
                <span className="rank-sales-count">Đã bán: {Number(product.soldQuantity || 0)}</span>
                <span className={Number(product.stock || 0) > 0 ? 'rank-stock in-stock' : 'rank-stock out-stock'}>
                  {Number(product.stock || 0) > 0 ? 'Còn hàng' : 'Hết hàng'}
                </span>
              </div>
              <div className="rank-meta">
                <span>{product.category}</span>
                <span>{Number(product.averageRating || 0).toFixed(1)} ★</span>
                <span>{Number(product.reviewCount || 0)} đánh giá</span>
                <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
              </div>
            </div>

            <div className="rank-actions">
              <Link className="primary-button rank-link" to={`/product/${product.id}`}>
                Xem chi tiết
              </Link>
              <button
                className="secondary-button rank-link"
                type="button"
                onClick={() => handleAddToCart(product)}
                disabled={Number(product.stock || 0) <= 0}
              >
                Thêm vào giỏ hàng
              </button>
              {Number(product.stock || 0) > 0 ? (
                <Link className="ghost-button rank-link" to="/rentals">
                  Thuê ngay
                </Link>
              ) : (
                <span className="rank-rental-disabled">Không hỗ trợ thuê</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default BestSells;
