import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useProductsData } from './useBoardgameApi';
import { addToCart } from './cartStorage';
import { toggleFavorite, useFavoriteItemsState } from './favoriteStorage';
import ProductArtwork from './ProductArtwork';
import '../css/Catalog.css';

const priceRanges = {
  all: [0, Infinity],
  below500: [0, 500000],
  mid: [500001, 900000],
  above900: [900001, Infinity],
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function getProductNumericValue(product, keys, fallback = 0) {
  for (const key of keys) {
    const value = product?.[key];
    if (value === 0 || value === '0' || value === false) {
      return 0;
    }

    if (value !== undefined && value !== null && value !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function getProductRatingValue(product) {
  return getProductNumericValue(product, ['rating', 'averageRating'], 0);
}

function getProductReviewCountValue(product) {
  return getProductNumericValue(product, ['reviews', 'reviewCount'], 0);
}

function getCategoryValues(product) {
  return [product?.category, product?.categoryName, product?.categoryLabel, product?.loai_ten, product?.loai_ten_vi, product?.categorySlug, product?.type]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function getProductTagValues(product) {
  return [
    ...getCategoryValues(product),
    ...(Array.isArray(product?.labels) ? product.labels : []),
    ...(Array.isArray(product?.tags) ? product.tags : []),
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function matchesCategoryFilter(product, selectedCategory) {
  if (!selectedCategory || selectedCategory === 'Tất cả') {
    return true;
  }

  const target = normalizeText(selectedCategory);
  return getProductTagValues(product).some((value) => normalizeText(value) === target);
}

function parsePlayerRange(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { min: 0, max: 0 };
  }

  const normalized = raw.replace(/–/g, '-').replace(/—/g, '-').replace(/\s+/g, '');
  const simpleMatch = normalized.match(/^(\d+)\+?$/i);
  if (simpleMatch) {
    return { min: Number(simpleMatch[1]), max: Number(simpleMatch[1]) };
  }

  const rangeMatch = normalized.match(/^(\d+)(?:-(\d+))?$/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2] ?? rangeMatch[1]);
    return { min, max };
  }

  const numbers = normalized.match(/\d+/g) || [];
  if (numbers.length > 0) {
    const parsed = numbers.map((item) => Number(item));
    return { min: parsed[0], max: parsed[parsed.length - 1] };
  }

  return { min: 0, max: 0 };
}

function playerBucketMatches(value, bucket) {
  const { min, max } = parsePlayerRange(value);

  switch (bucket) {
    case '1':
      return max >= 1 && min <= 1;
    case '2':
      return max >= 2 && min <= 2;
    case '3-4':
      return max >= 3 && min <= 4;
    case '5-6':
      return max >= 5 && min <= 6;
    case '7-8':
      return max >= 7 && min <= 8;
    case '9+':
      return max >= 9;
    default:
      return true;
  }
}

function parseAgeValue(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function matchesAgeFilter(product, selectedAge) {
  if (!selectedAge || selectedAge === 'Tất cả') {
    return true;
  }

  const threshold = Number.parseInt(String(selectedAge).replace('+', ''), 10);
  if (!Number.isFinite(threshold)) {
    return true;
  }

  return parseAgeValue(product?.age) >= threshold;
}

function Catalog() {
  const products = useProductsData();
  const favoriteItems = useFavoriteItemsState();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  const tagQuery = searchParams.get('tag') || searchParams.get('category') || '';

  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [categoryFilter, setCategoryFilter] = useState('Tất cả');
  const [playerFilter, setPlayerFilter] = useState('Tất cả');
  const [ageFilter, setAgeFilter] = useState('Tất cả');
  const [priceFilter, setPriceFilter] = useState('all');
  const [favoriteFilter, setFavoriteFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState(tagQuery);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    document.title = 'Danh mục BoardGame | BoardGame Nexus';
  }, []);

  useEffect(() => {
    setSearchTerm(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setTagFilter(tagQuery);
  }, [tagQuery]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setStatusMessage(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  const favoriteProductIds = useMemo(
    () => new Set(favoriteItems.map((item) => Number(item)).filter((item) => item > 0)),
    [favoriteItems]
  );

  const filteredProducts = useMemo(() => {
    const query = normalizeText(searchTerm.trim());
    const [minPrice, maxPrice] = priceRanges[priceFilter];

    return products.filter((product) => {
      const matchesSearch = !query || normalizeText([product.name, product.category, product.description, ...(Array.isArray(product.labels) ? product.labels : [])].join(' ')).includes(query);
      const matchesCategory = matchesCategoryFilter(product, categoryFilter);
      const matchesPlayers = playerFilter === 'Tất cả' || playerBucketMatches(product.players, playerFilter === '1 người' ? '1' : playerFilter === '2 người' ? '2' : playerFilter === '3–4 người' ? '3-4' : playerFilter === '5–6 người' ? '5-6' : playerFilter === '7–8 người' ? '7-8' : playerFilter === '9+ người' ? '9+' : 'all');
      const matchesAge = matchesAgeFilter(product, ageFilter);
      const currentPrice = Number(product.currentPrice ?? product.price ?? 0);
      const matchesPrice = currentPrice >= minPrice && currentPrice <= maxPrice;
      const matchesTag = !tagFilter || matchesCategoryFilter(product, tagFilter);
      const matchesFavorite = favoriteFilter !== 'favorites' || favoriteProductIds.has(Number(product.id));

      return matchesSearch && matchesCategory && matchesPlayers && matchesAge && matchesPrice && matchesTag && matchesFavorite;
    });
  }, [ageFilter, categoryFilter, favoriteFilter, favoriteProductIds, playerFilter, priceFilter, products, searchTerm, tagFilter]);

  const categoryOptions = ['Tất cả', ...new Set(products.flatMap((product) => getProductTagValues(product)).filter(Boolean))];
  const playerOptions = ['Tất cả', '1 người', '2 người', '3–4 người', '5–6 người', '7–8 người', '9+ người'];
  const ageOptions = ['Tất cả', '6+', '7+', '8+', '10+', '12+', '13+', '14+'];

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
    <section className="card-surface catalog-section">
      <div className="section-heading catalog-heading">
        <div className="catalog-heading-copy">
          <h2 className="catalog-page-title">Danh mục BoardGame</h2>
          <p className="catalog-page-subtitle">Khám phá board game theo thể loại, độ tuổi, số người chơi, trạng thái yêu thích và mức giá đang có trong hệ thống.</p>
        </div>
        <div className="search-box">
          <label htmlFor="search-boardgame">Tìm theo tên</label>
          <input id="search-boardgame" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Ví dụ: Catan, Azul, Dixit..." />
        </div>
      </div>

      {tagFilter ? (
        <div className="catalog-filter-chip-row">
          <span className="catalog-filter-chip">Đang lọc theo: {tagFilter}</span>
          <button className="catalog-filter-reset" type="button" onClick={() => setTagFilter('')}>
            Bỏ lọc
          </button>
        </div>
      ) : null}

      <div className="filters">
        <label>
          Danh mục sản phẩm
          <select value={favoriteFilter} onChange={(event) => setFavoriteFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="favorites">Đã yêu thích</option>
          </select>
        </label>
        <label>
          Thể loại
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Số người chơi
          <select value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value)}>
            {playerOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Độ tuổi
          <select value={ageFilter} onChange={(event) => setAgeFilter(event.target.value)}>
            {ageOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          Giá tiền
          <select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}>
            <option value="all">Tất cả</option>
            <option value="below500">Dưới 500k</option>
            <option value="mid">500k - 900k</option>
            <option value="above900">Trên 900k</option>
          </select>
        </label>
      </div>

      {statusMessage ? <p className="catalog-status-toast">{statusMessage}</p> : null}

      <div className="catalog-grid-wrap">
        <div className="product-grid catalog-product-grid">
          {filteredProducts.map((product) => {
            const isFavorite = favoriteProductIds.has(Number(product.id));

            return (
              <article className="product-card catalog-product-card" key={product.id}>
                <Link className="product-card-link catalog-product-link" to={`/product/${product.id}`}>
                <ProductArtwork product={product} className="product-visual" />
                <div className="product-card-body">
                  <span className="category-pill">{product.category}</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="chip-row">
                    <span>{product.players} người</span>
                    <span>{product.age}</span>
                    <span>{getProductRatingValue(product).toFixed(1)} ★</span>
                  </div>
                  <div className="tag-row">
                    {(Array.isArray(product.labels) ? product.labels : []).map((label) => (<span key={label}>{label}</span>))}
                  </div>
                  <div className="product-footer">
                    <strong>{Number(product.currentPrice ?? product.price ?? 0).toLocaleString('vi-VN')} đ</strong>
                    {Number(product.originalPrice ?? 0) > Number(product.currentPrice ?? product.price ?? 0) ? (
                      <del>{Number(product.originalPrice).toLocaleString('vi-VN')} đ</del>
                    ) : null}
                    <span>{getProductReviewCountValue(product)} đánh giá</span>
                  </div>
                </div>
                </Link>
                <div className="catalog-card-actions">
                  <button
                    className={`catalog-action-button catalog-action-favorite ${isFavorite ? 'active' : ''}`}
                    type="button"
                    onClick={(event) => handleToggleFavorite(event, product)}
                    aria-pressed={isFavorite}
                  >
                    <span className="catalog-action-icon" aria-hidden="true">{isFavorite ? '♥' : '♡'}</span>
                    {isFavorite ? 'Đã yêu thích' : 'Thêm vào yêu thích'}
                  </button>
                  <button
                    className="catalog-action-button catalog-action-cart"
                    type="button"
                    onClick={(event) => handleAddToCart(event, product)}
                    disabled={!Number(product.stock || 0)}
                  >
                    {Number(product.stock || 0) ? 'Thêm vào giỏ hàng' : 'Tạm hết hàng'}
                  </button>
                </div>
              </article>
            );
          })}
          {filteredProducts.length === 0 ? <p className="catalog-empty-state">Không tìm thấy board game phù hợp với bộ lọc hiện tại.</p> : null}
        </div>
      </div>
    </section>
  );
}

export default Catalog;