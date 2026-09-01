import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../css/NotFound.css';

function NotFound() {
  useEffect(() => {
    document.title = 'Không tìm thấy trang | BoardGame Nexus';
  }, []);

  return (
    <section className="card-surface notfound-card">
      <p className="eyebrow">404</p>
      <h2>Không tìm thấy trang</h2>
      <p>Trang bạn tìm kiếm không tồn tại hoặc đã được đặt lại tên theo cấu trúc trang mới.</p>
      <Link className="primary-button" to="/">Về trang chủ</Link>
    </section>
  );
}

export default NotFound;