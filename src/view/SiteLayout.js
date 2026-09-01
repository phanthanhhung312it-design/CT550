import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { blogMenuItems, footerContent, navigationItems } from './boardgameData';
import { useCartItemsState } from './cartStorage';
import { useProductsData } from './useBoardgameApi';
import { getAuthUser, isAuthenticated } from './auth';
import ChatbotBubble from './ChatbotBubble';
import ProductArtwork from './ProductArtwork';
import '../css/SiteLayout.css';

function SiteLayout() {
  const navigate = useNavigate();
  const products = useProductsData();
  const cartItems = useCartItemsState();
  const searchInputRef = useRef(null);
  const navMenuRef = useRef(null);
  const scrollPositionRef = useRef(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNavbarHidden, setIsNavbarHidden] = useState(false);
  const [isBlogMenuOpen, setIsBlogMenuOpen] = useState(false);
  const [isCartBumping, setIsCartBumping] = useState(false);
  const [authState, setAuthState] = useState(getAuthUser());
  const authUser = authState?.user;

  const cartItemCount = useMemo(
    () => cartItems.reduce((total, item) => total + Number(item.quantity || 0), 0),
    [cartItems]
  );

  const searchKeywords = useMemo(() => {
    const tokens = products.flatMap((product) => [product.name, product.category, ...product.labels]);
    return [...new Set(tokens)].slice(0, 12);
  }, [products]);

  const liveSearchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return products.slice(0, 6);
    }

    return products.filter((product) => {
      const haystack = [product.name, product.category, product.description, ...product.labels]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    }).slice(0, 6);
  }, [products, searchTerm]);

  const suggestedTerms = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return searchKeywords;
    }

    return searchKeywords.filter((keyword) => keyword.toLowerCase().includes(query)).slice(0, 8);
  }, [searchKeywords, searchTerm]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    navigate(`/catalog?search=${encodeURIComponent(searchTerm.trim())}`);
  }

  function openSearch() {
    setIsBlogMenuOpen(false);
    setIsSearchOpen(true);
  }

  function closeSearch() {
    setIsSearchOpen(false);
  }

  function handleSearchChange(event) {
    if (!isSearchOpen) {
      setIsSearchOpen(true);
    }

    setSearchTerm(event.target.value);
  }

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    function handleScroll() {
      const currentScrollY = window.scrollY;
      const isScrollingDown = currentScrollY > scrollPositionRef.current;

      setIsNavbarHidden(currentScrollY > 120 && isScrollingDown);
      setIsBlogMenuOpen(false);
      scrollPositionRef.current = currentScrollY;
    }

    scrollPositionRef.current = window.scrollY;
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        closeSearch();
        setIsBlogMenuOpen(false);
      }
    }

    if (isSearchOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    function syncAuthState() {
      setAuthState(getAuthUser());
    }

    window.addEventListener('boardgamevn-auth-change', syncAuthState);
    window.addEventListener('storage', syncAuthState);

    return () => {
      window.removeEventListener('boardgamevn-auth-change', syncAuthState);
      window.removeEventListener('storage', syncAuthState);
    };
  }, []);

  useEffect(() => {
    function handleCartFeedback() {
      setIsCartBumping(true);
      window.clearTimeout(handleCartFeedback.timeoutId);
      handleCartFeedback.timeoutId = window.setTimeout(() => setIsCartBumping(false), 480);
    }

    handleCartFeedback.timeoutId = 0;
    window.addEventListener('boardgamevn-cart-feedback', handleCartFeedback);
    return () => {
      window.clearTimeout(handleCartFeedback.timeoutId);
      window.removeEventListener('boardgamevn-cart-feedback', handleCartFeedback);
    };
  }, []);

  function handleAvatarClick() {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }

    const role = (authUser?.role || '').toLowerCase();
    if (role === 'admin') {
      navigate('/admin');
      return;
    }

    if (role === 'employee') {
      navigate('/blog-manager');
      return;
    }

    navigate('/account');
  }

  function toggleBlogMenu() {
    setIsBlogMenuOpen((current) => !current);
  }

  useEffect(() => {
    function handleOutsideClick(event) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target)) {
        setIsBlogMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  return (
    <>
      <img className="side-banner side-banner-left" src="/image/w2.jpg" alt="" aria-hidden="true" />
      <img className="side-banner side-banner-right" src="/image/w2.jpg" alt="" aria-hidden="true" />

      <div className="page-shell">
      <div className="top-strip">
        <span>100% chính hãng | Giao hàng toàn quốc | Hotline: 0969 914 344</span>
      </div>

      <div className={`navbar-shell ${isNavbarHidden ? 'is-hidden' : ''}`} ref={navMenuRef}>
        <header className="topbar card-surface">
          <Link className="brand-mark" to="/" aria-label="Về trang chủ Board Game VN">
            <img className="brand-logo" src="/logo.jpg" alt="Board Game VN" />
            <div>
              <p className="eyebrow">Board Game VN Store</p>
              <h1>Board Game VN — Cửa Hàng Board Game Chính Hãng</h1>
            </div>
          </Link>

          <div className="header-actions">
            <button
              className="header-icon-button"
              type="button"
              aria-label="Mở tìm kiếm"
              aria-expanded={isSearchOpen}
              onClick={openSearch}
            >
              <span className="header-icon-symbol">🔍</span>
            </button>
            <button
              className="header-icon-button"
              type="button"
              onClick={handleAvatarClick}
              aria-label={authUser ? `Tài khoản ${authUser.displayName}` : 'Đăng nhập tài khoản'}
            >
              <span className="header-icon-symbol">{authUser ? authUser.avatar : '👤'}</span>
            </button>
            <NavLink className={`header-icon-button header-cart-button ${isCartBumping ? 'is-bumping' : ''}`} to="/cart" aria-label="Giỏ hàng">
              <span className="header-icon-symbol">🛒</span>
              {cartItemCount > 0 ? <span className="header-cart-badge">{cartItemCount}</span> : null}
            </NavLink>
          </div>
        </header>

        <nav className="nav-card card-surface" aria-label="Điều hướng chính">
          {navigationItems.map((item) => {
            if (item.dropdown) {
              return (
                <div className="nav-dropdown" key={item.label}>
                  <button className="nav-item nav-dropdown-trigger" type="button" onClick={toggleBlogMenu} aria-expanded={isBlogMenuOpen}>
                    {item.label}
                  </button>
                  {isBlogMenuOpen ? (
                    <div className="nav-dropdown-menu" role="menu">
                      {blogMenuItems.map((menuItem) => (
                        <Link key={menuItem.path} to={menuItem.path} className="nav-dropdown-item" role="menuitem" onClick={() => setIsBlogMenuOpen(false)}>
                          {menuItem.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }

            if (item.path.includes('#')) {
              return (
                <Link key={item.label} to={item.path} className="nav-item nav-link-like" onClick={() => setIsBlogMenuOpen(false)}>
                  {item.label}
                </Link>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setIsBlogMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <main>
        <Outlet />
      </main>

      {isSearchOpen ? (
        <div className="search-overlay" role="presentation" onClick={closeSearch}>
          <section className="search-panel card-surface" role="dialog" aria-modal="true" aria-label="Tìm kiếm sản phẩm" onClick={(event) => event.stopPropagation()}>
            <div className="search-panel-header">
              <div>
                <p className="eyebrow">Tìm kiếm tức thì</p>
                <h2>Nhập từ khóa để xem kết quả ngay</h2>
              </div>
              <button className="search-panel-close" type="button" aria-label="Đóng tìm kiếm" onClick={closeSearch}>
                ✕
              </button>
            </div>

            <form className="search-panel-form" onSubmit={handleSearchSubmit} role="search">
              <input
                ref={searchInputRef}
                className="search-panel-input"
                type="search"
                placeholder="Tìm BoardGame, thể loại, tên sản phẩm..."
                aria-label="Tìm kiếm sản phẩm"
                value={searchTerm}
                onChange={handleSearchChange}
              />
              <Link className="secondary-button" to={`/catalog?search=${encodeURIComponent(searchTerm.trim())}`} onClick={closeSearch}>
                Xem tất cả
              </Link>
            </form>

            <div className="search-panel-body">
              <section className="search-panel-suggestions">
                <p className="search-panel-label">Gợi ý từ khóa tìm kiếm</p>
                <div className="search-chip-row">
                  {suggestedTerms.length > 0 ? suggestedTerms.map((keyword) => (
                    <button
                      className="search-chip"
                      type="button"
                      key={keyword}
                      onClick={() => setSearchTerm(keyword)}
                    >
                      {keyword}
                    </button>
                  )) : (
                    <span className="search-empty-state">Không có gợi ý phù hợp.</span>
                  )}
                </div>
              </section>

              <section className="search-panel-results">
                <p className="search-panel-label">Danh sách sản phẩm phù hợp</p>
                <div className="search-results-list">
                  {liveSearchResults.length > 0 ? liveSearchResults.map((product) => (
                    <Link className="search-result-card" key={product.id} to={`/product/${product.id}`} onClick={closeSearch}>
                      <ProductArtwork product={product} className="search-result-image" />
                      <div className="search-result-body">
                        <h3>{product.name}</h3>
                        <p>{product.category}</p>
                        <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
                      </div>
                    </Link>
                  )) : (
                    <div className="search-empty-state">Không tìm thấy sản phẩm phù hợp.</div>
                  )}
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="site-footer card-surface" aria-label="Chân trang website">
        <section className="footer-brand-block">
          <p className="eyebrow">{footerContent.storeName}</p>
          <h3>Board Game VN</h3>
          <p>{footerContent.description}</p>
        </section>

        <section className="footer-contact-block">
          <h4>Thông tin cửa hàng</h4>
          <ul>
            <li><span>Địa chỉ:</span> {footerContent.contact.address}</li>
            <li><span>Điện thoại:</span> <a href={`tel:${footerContent.contact.phone.replace(/\s+/g, '')}`}>{footerContent.contact.phone}</a></li>
            <li><span>Email:</span> <a href={`mailto:${footerContent.contact.email}`}>{footerContent.contact.email}</a></li>
          </ul>
        </section>

        <section className="footer-links-block">
          <h4>Liên kết nhanh</h4>
          <div className="footer-links">
            {footerContent.quickLinks.map((item) => (
              <Link key={item.path} to={item.path}>{item.label}</Link>
            ))}
          </div>
        </section>

        <section className="footer-social-block">
          <h4>Mạng xã hội</h4>
          <div className="footer-social-links">
            {footerContent.socialLinks.map((item) => (
              <a
                key={item.label}
                className="footer-social-link"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={item.label}
                title={item.label}
              >
                <span className="footer-social-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="site-footer-copy">{footerContent.copyright}</div>
      </footer>

      <ChatbotBubble />
      </div>
    </>
  );
}

export default SiteLayout;