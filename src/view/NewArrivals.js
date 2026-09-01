import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProductsData } from './useBoardgameApi';
import ProductArtwork from './ProductArtwork';
import { sortByNewestFirst } from './homeFilters';
import '../css/NewArrivals.css';

function NewArrivals() {
  const products = useProductsData();
  const newArrivalProducts = useMemo(() => sortByNewestFirst(products), [products]);

  useEffect(() => {
    document.title = 'Hàng mới về | Board Game VN';
  }, []);

  return (
    <section className="card-surface new-arrivals-page">
      <div className="section-heading new-arrivals-heading">
        <div>
          <p className="eyebrow section-title-line">🆕 HÀNG MỚI VỀ</p>
          <h2>Tất cả mặt hàng mới về</h2>
        </div>
        <Link className="secondary-button" to="/catalog">Xem toàn bộ danh mục</Link>
      </div>

      <div className="new-arrivals-grid">
        {newArrivalProducts.map((product) => (
          <Link className="new-arrivals-card-link" key={product.id} to={`/product/${product.id}`}>
            <article className="new-arrivals-card">
              <ProductArtwork product={product} className="new-arrivals-image" imageClassName="new-arrivals-image-content" />
              <div className="new-arrivals-body">
                <span className="new-badge inline">MỚI VỀ</span>
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <strong>{product.price.toLocaleString('vi-VN')} đ</strong>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default NewArrivals;