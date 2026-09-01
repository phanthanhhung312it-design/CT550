import { useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useProductsData } from './useBoardgameApi';
import { addToCart } from './cartStorage';
import ProductArtwork from './ProductArtwork';
import '../css/ProductDetail.css';

function formatCurrency(value) {
  return `${value.toLocaleString('vi-VN')} đ`;
}

function buildGameProfile(product) {
  const categoryHints = {
    'Chiến lược': {
      difficulty: 'Trung bình - Khá',
      duration: '45 - 90 phút',
      mechanics: ['Chiến thuật', 'Quản lý tài nguyên', 'Xây dựng engine'],
      components: ['Bàn chơi', 'Thẻ mục tiêu', 'Token tài nguyên', 'Luật chơi'],
    },
    'Gia đình': {
      difficulty: 'Dễ - Trung bình',
      duration: '30 - 45 phút',
      mechanics: ['Thu thập set', 'Tối ưu lượt chơi', 'Tương tác nhẹ'],
      components: ['Thẻ bài', 'Bảng điểm', 'Mảnh ghép', 'Luật chơi'],
    },
    Logic: {
      difficulty: 'Trung bình',
      duration: '30 - 40 phút',
      mechanics: ['Sắp xếp', 'Tối ưu không gian', 'Giải đố'],
      components: ['Mảnh ghép', 'Bảng chơi', 'Token', 'Luật chơi'],
    },
    'Sáng tạo': {
      difficulty: 'Dễ',
      duration: '30 - 60 phút',
      mechanics: ['Kể chuyện', 'Suy diễn', 'Tưởng tượng'],
      components: ['Thẻ minh họa', 'Bộ manh mối', 'Luật chơi'],
    },
    'Kinh tế': {
      difficulty: 'Trung bình - Khá',
      duration: '45 - 75 phút',
      mechanics: ['Đấu giá', 'Quản lý tài nguyên', 'Xây dựng bộ máy'],
      components: ['Token tài nguyên', 'Thẻ phát triển', 'Bản đồ', 'Luật chơi'],
    },
    'Hợp tác': {
      difficulty: 'Trung bình',
      duration: '45 - 60 phút',
      mechanics: ['Co-op', 'Chia sẻ thông tin', 'Quản lý áp lực'],
      components: ['Bản đồ', 'Token bệnh dịch', 'Thẻ sự kiện', 'Luật chơi'],
    },
    'Suy luận': {
      difficulty: 'Trung bình - Khá',
      duration: '30 - 60 phút',
      mechanics: ['Ẩn vai', 'Suy luận', 'Điều tra'],
      components: ['Thẻ vai', 'Bộ manh mối', 'Token', 'Luật chơi'],
    },
    Party: {
      difficulty: 'Dễ',
      duration: '15 - 30 phút',
      mechanics: ['Party game', 'Nhịp nhanh', 'Tương tác nhóm'],
      components: ['Bộ thẻ', 'Token', 'Luật chơi'],
    },
  };

  const fallback = {
    difficulty: 'Trung bình',
    duration: '30 - 60 phút',
    mechanics: ['Chiến thuật', 'Tương tác'],
    components: ['Bộ sản phẩm', 'Luật chơi'],
  };

  return categoryHints[product.category] || fallback;
}

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const products = useProductsData();
  const product = products.find((item) => String(item.id) === String(id));

  useEffect(() => {
    document.title = product ? `${product.name} | Board Game VN` : 'Không tìm thấy sản phẩm | Board Game VN';
  }, [product]);

  const productDetails = useMemo(() => {
    if (!product) {
      return null;
    }

    const originalPrice = Number(product.originalPrice ?? product.price ?? 0);
    const currentPrice = Number(product.currentPrice ?? product.price ?? 0);
    const discountPercent = Number(product.discount || 0);
    const savings = Math.max(0, originalPrice - currentPrice);
    const tags = [...new Set([product.category, ...(product.labels || [])])];
    const gameProfile = buildGameProfile(product);
    const faqItems = [
      {
        question: 'Sản phẩm này phù hợp với ai?',
        answer: `Phù hợp với người chơi thích thể loại ${product.category.toLowerCase()} và nhóm ${product.players} người.`,
      },
      {
        question: 'Bao lâu thì chơi xong một ván?',
        answer: `Thời lượng gợi ý khoảng ${gameProfile.duration}.`,
      },
      {
        question: 'Bên trong hộp có gì?',
        answer: gameProfile.components.join(', '),
      },
    ];

    return {
      discountPercent,
      originalPrice,
      currentPrice,
      savings,
      tags,
      gameProfile,
      faqItems,
    };
  }, [product]);

  if (!product) {
    return <Navigate to="/404" replace />;
  }

  const relatedProducts = [...products]
    .filter((item) => item.id !== product.id)
    .map((item) => {
      const sharedLabels = (item.labels || []).filter((label) => product.labels?.includes(label)).length;
      const sameCategory = item.category === product.category ? 3 : 0;
      const samePlayers = item.players === product.players ? 1 : 0;
      const similarAge = item.age === product.age ? 1 : 0;
      return {
        item,
        score: sameCategory + sharedLabels * 2 + samePlayers + similarAge,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ item }) => item);

  function handleAddToCart() {
    addToCart(product.id, 1);
  }

  function handleBuyNow() {
    addToCart(product.id, 1);
    navigate('/checkout');
  }

  function handleTagClick(tag) {
    navigate(`/catalog?tag=${encodeURIComponent(tag)}`);
  }

  return (
    <section className="detail-page">
      <div className="card-surface detail-hero">
        <div className="detail-media-column">
          <div className="detail-sticky-visual">
            <ProductArtwork product={product} className="detail-visual" imageClassName="detail-visual-image" />
          </div>
        </div>

        <div className="detail-content-column">
          <div className="detail-header">
            <p className="eyebrow">Chi tiết sản phẩm</p>
            <h2>{product.name}</h2>
            <p className="detail-description">{product.description}</p>
          </div>

          <div className="detail-price-grid">
            <div>
              <span className="detail-label">Giá gốc</span>
              <strong className="detail-original-price">{formatCurrency(productDetails.originalPrice)}</strong>
            </div>
            <div>
              <span className="detail-label">Giá khuyến mãi</span>
              <strong className="detail-sale-price">{formatCurrency(productDetails.currentPrice)}</strong>
            </div>
            <div>
              <span className="detail-label">Tiết kiệm</span>
              <strong className="detail-discount">-{productDetails.discountPercent}%</strong>
              <small className="detail-savings">Tiết kiệm {formatCurrency(productDetails.savings)}</small>
            </div>
          </div>

          <div className="detail-actions">
            <button className="primary-button" type="button" onClick={handleAddToCart}>Thêm vào giỏ hàng</button>
            <button className="secondary-button" type="button" onClick={handleBuyNow}>Mua ngay</button>
            <Link className="ghost-button" to="/catalog">Tiếp tục xem sản phẩm</Link>
          </div>

          <section className="detail-block card-surface">
            <h3>Thông tin nhận hàng tại cửa hàng</h3>
            <p>Nhận hàng tại cửa hàng trong giờ mở cửa, kiểm tra hàng trước khi thanh toán và được hỗ trợ tư vấn thêm về cách chơi.</p>
          </section>

          <section className="detail-block card-surface">
            <h3>Mô tả sản phẩm</h3>
            <p>{product.description}</p>
          </section>

          <section className="detail-block card-surface">
            <h3>Gameplay</h3>
            <div className="detail-spec-grid">
              <div><span>Số lượng người chơi</span><strong>{product.players} người</strong></div>
              <div><span>Độ tuổi</span><strong>{product.age}</strong></div>
              <div><span>Thời gian chơi</span><strong>{productDetails.gameProfile.duration}</strong></div>
              <div><span>Độ khó</span><strong>{productDetails.gameProfile.difficulty}</strong></div>
            </div>
          </section>

          <section className="detail-block card-surface">
            <h3>Danh mục và thể loại sản phẩm</h3>
            <div className="detail-tag-row">
              {productDetails.tags.map((tag) => (
                <button key={tag} className="detail-tag-button" type="button" onClick={() => handleTagClick(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="detail-block card-surface">
            <h3>Thành phần trong hộp</h3>
            <ul className="detail-bullet-list">
              {productDetails.gameProfile.components.map((component) => (
                <li key={component}>{component}</li>
              ))}
            </ul>
          </section>

          <section className="detail-block card-surface">
            <h3>Câu hỏi thường gặp</h3>
            <div className="detail-faq-list">
              {productDetails.faqItems.map((faq) => (
                <details key={faq.question} className="detail-faq-item">
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="card-surface detail-related-section">
        <div className="section-heading detail-related-heading">
          <div>
            <p className="eyebrow">Đề xuất sản phẩm liên quan</p>
            <h3>Sản phẩm cùng thể loại, cùng cơ chế hoặc cùng độ khó</h3>
          </div>
          <p>Danh sách này ưu tiên các sản phẩm có chung danh mục, trùng nhãn và phù hợp với nhóm người chơi.</p>
        </div>

        <div className="related-list">
          {relatedProducts.map((item) => (
            <Link className="related-item" to={`/product/${item.id}`} key={item.id}>
              <ProductArtwork product={item} className="related-item-image" imageClassName="related-item-image-content" />
              <div className="related-item-body">
                <strong>{item.name}</strong>
                <span>{formatCurrency(Number(item.currentPrice ?? item.price ?? 0))}</span>
                <small>{Number(item.currentPrice ?? item.price ?? 0) < Number(item.originalPrice ?? item.price ?? 0) ? 'Đang giảm giá' : 'Giá bán hiện tại'}</small>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}

export default ProductDetail;