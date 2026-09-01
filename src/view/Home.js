import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useBestSellerProducts, useBlogPosts, useProductsData } from './useBoardgameApi';
import ProductArtwork from './ProductArtwork';
import { getFlashSaleProducts } from './FlashSale';
import { matchesPlayerCount, sortByNewestFirst } from './homeFilters';
import { formatBlogDate, getBlogPreviewText } from './blogUtils';
import '../css/Home.css';

function Home() {
  const location = useLocation();
  const products = useProductsData();
  const blogPosts = useBlogPosts();
  const bestSellerProducts = useBestSellerProducts();

  useEffect(() => {
    document.title = 'Trang chủ | Board Game VN';
  }, []);

  useEffect(() => {
    if (location.hash) {
      const targetElement = document.querySelector(location.hash);
      targetElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const flashSaleProducts = useMemo(() => getFlashSaleProducts(products).slice(0, 6), [products]);
  const partyProducts = products.filter((product) => product.category === 'Party' || product.category === 'Hợp tác').slice(0, 4);
  const twoPlayerProducts = useMemo(() => products.filter((product) => matchesPlayerCount(product, 2)).slice(0, 4), [products]);
  const newArrivalProducts = useMemo(() => sortByNewestFirst(products).slice(0, 6), [products]);
  const latestBlogPosts = useMemo(() => sortByNewestFirst(blogPosts).slice(0, 3), [blogPosts]);
  const maxDiscount = flashSaleProducts[0]?.discountPercent || 0;
  const saleCount = flashSaleProducts.length;

  return (
    <>
          <section className="hero-shell card-surface">
        <div className="hero-main">
          <div className="hero-copy">
            <p className="eyebrow">Cửa hàng BoardGame chính hãng</p>
            <h2>45+ tựa game, giao hàng toàn quốc, hỗ trợ tư vấn nhanh.</h2>
            <div className="hero-actions">
              <Link className="primary-button" to="/catalog">Xem bộ sưu tập</Link>
              <Link className="secondary-button" to="/support">Trò chuyện ngay</Link>
            </div>
          </div>

          <aside className="hero-panel hero-promo">
            <div className="promo-pill">FLASH SALE</div>
            <h3>Deal nổi bật hôm nay</h3>
            <p>Mua ngay để nhận ưu đãi hấp dẫn từ sản phẩm đang giảm giá hôm nay.</p>
            <div className="promo-stats">
              <div><strong>{maxDiscount > 0 ? `${maxDiscount}%` : '0%'}</strong><span>Giảm tối đa</span></div>
              <div><strong>{saleCount > 0 ? `${saleCount}+` : '0'}</strong><span>Sản phẩm giảm giá</span></div>
              <div><strong>45+</strong><span>Tựa game</span></div>
            </div>
          </aside>
        </div>

      </section>

      <section className="feature-banner">
        <Link to="/best-sells" aria-label="Xem các sản phẩm bán chạy">
          <img
            className="feature-banner-image"
            src="/image/w.jpg"
            alt="100% chính hãng, giao hàng toàn quốc, hotline và chat nhanh"
          />
        </Link>
      </section>
      
      <section className="home-section card-surface section-block sale-section">
        <div className="section-heading">
          <div className="heading-stack">
            <p className="eyebrow sale-eyebrow section-title-line">⚡ FLASH SALE</p>
          </div>
        </div>

        <div className="product-grid sale-grid">
          {flashSaleProducts.map((product) => (
            <Link className="product-card-link" key={product.id} to={`/product/${product.id}`}>
              <article className="product-card sale-card">
                <div className="product-badge-row">
                  <span className="sale-badge">-{product.discountPercent}%</span>
                  <span className="new-badge">LIVE</span>
                </div>
                <ProductArtwork product={product} className="product-visual" />
                <div className="product-card-body">
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="price-stack">
                    <strong>{product.discountedPrice.toLocaleString('vi-VN')} đ</strong>
                    <span>{Number(product.price || 0).toLocaleString('vi-VN')} đ</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <div className="section-action-bar">
          <Link className="secondary-button section-link-wide" to="/flash-sale">Xem tất cả các deal</Link>
        </div>
      </section>

      <section className="home-section card-surface section-block">
        <div className="section-heading">
          <div className="heading-stack">
            <p className="eyebrow section-title-line">🔥 HÀNG HOT — BEST SELLERS</p>
          </div>
        </div>

        <div className="row-cards">
          {bestSellerProducts.slice(0, 6).map((product) => (
            <Link className="product-card-link" key={product.id} to={`/product/${product.id}`}>
              <article className="row-card">
                <ProductArtwork product={product} className="row-card-image" />
                <div className="row-card-body">
                  <span className="category-pill">{product.category}</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="price-stack compact">
                    <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
                    <span>{Number(product.soldQuantity || 0)} lượt bán</span>
                  </div>
                  <div className="price-stack compact">
                    <span>{Number(product.averageRating || 0).toFixed(1)} ★</span>
                    <span>{Number(product.reviewCount || 0)} đánh giá</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <div className="section-action-bar">
          <Link className="secondary-button section-link-wide" to="/best-sells">Xem tất cả game hot</Link>
        </div>
      </section>

      <section className="home-section card-surface section-block">
        <div className="section-heading">
          <div className="heading-stack">
            <p className="eyebrow section-title-line">💕 BOARD GAME 2 NGƯỜI</p>
          </div>
        </div>

        <div className="row-cards narrow">
          {twoPlayerProducts.map((product) => (
            <Link className="product-card-link" key={product.id} to={`/product/${product.id}`}>
              <article className="row-card compact-card">
                <ProductArtwork product={product} className="row-card-image" />
                <div className="row-card-body">
                  <h3>{product.name}</h3>
                  <p>{product.category}</p>
                  <strong>{Number(product.price || 0).toLocaleString('vi-VN')} đ</strong>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <div className="section-action-bar">
          <Link className="secondary-button section-link-wide" to="/new-arrivals">Xem tất cả</Link>
        </div>
      </section>

      <section className="home-section card-surface section-block">
        <div className="section-heading">
          <div className="heading-stack">
            <p className="eyebrow section-title-line">🎉 PARTY GAME</p>
          </div>
        </div>

        <div className="row-cards">
          {partyProducts.map((product) => (
            <Link className="product-card-link" key={product.id} to={`/product/${product.id}`}>
              <article className="row-card">
                <ProductArtwork product={product} className="row-card-image" />
                <div className="row-card-body">
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <div className="section-action-bar">
          <Link className="secondary-button section-link-wide" to="/new-arrivals">Xem tất cả</Link>
        </div>
      </section>

      <section id="new-arrivals" className="home-section card-surface section-block">
        <div className="section-heading">
          <div className="heading-stack">
            <p className="eyebrow section-title-line">🆕 HÀNG MỚI VỀ</p>
          </div>
        </div>

        <div className="row-cards">
          {newArrivalProducts.map((product) => (
            <Link className="product-card-link" key={product.id} to={`/product/${product.id}`}>
              <article className="row-card new-row-card">
                <ProductArtwork product={product} className="row-card-image" />
                <div className="row-card-body">
                  <span className="new-badge inline">MỚI VỀ</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
                </div>
              </article>
            </Link>
          ))}
        </div>

        <div className="section-action-bar">
          <Link className="secondary-button section-link-wide" to="/new-arrivals">Xem tất cả</Link>
        </div>
      </section>
      <section className="home-section card-surface section-block blog-strip">
        <div className="section-heading">
          <div className="heading-stack">
            <p className="eyebrow section-title-line">📰 Blog</p>
          </div>
        </div>

        <div className="blog-grid">
          {latestBlogPosts.map((post) => (
            <Link key={post.id} className="blog-card-link" to={`/blog/${post.slug}`}>
              <article className="blog-card">
                <img src={post.coverImage || '/image/catan.jpg'} alt={post.title} loading="lazy" />
                <span>{formatBlogDate(post.date || post.publishedAt || post.createdAt || post.updatedAt)}</span>
                <h3>{post.title}</h3>
                <p>{getBlogPreviewText(post)}</p>
              </article>
            </Link>
          ))}
        </div>

        <div className="section-action-bar">
          <Link className="secondary-button section-link-wide" to="/blog">Tìm hiểu thêm</Link>
        </div>
      </section>

    </>
  );
}

export default Home;