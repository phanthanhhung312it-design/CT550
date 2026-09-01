import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAuthUser, setAuthUser, isAuthenticated } from './auth';
import '../css/Login.css';

function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Đăng nhập | Board Game VN';
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate((getAuthUser()?.user?.role || '').toLowerCase() === 'admin' ? '/admin' : '/account', { replace: true });
    }
  }, [navigate]);

  function handleSubmit(event) {
    event.preventDefault();

    const trimmedIdentifier = identifier.trim();
    const trimmedPassword = password.trim();

    if (!trimmedIdentifier || !trimmedPassword) {
      setErrorMessage('Vui lòng nhập email/tên đăng nhập và mật khẩu.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: trimmedIdentifier,
        password: trimmedPassword,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message || 'Đăng nhập không thành công.');
        }

        return payload;
      })
      .then(({ token, user }) => {
        setAuthUser({ token, user });

        if ((user.role || '').toLowerCase() === 'admin') {
          navigate('/admin', { replace: true });
          return;
        }

        navigate('/account', { replace: true });
      })
      .catch((error) => {
        setErrorMessage(error.message);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  return (
    <section className="auth-page card-surface">
      <div className="auth-card">
        <Link className="auth-logo-link" to="/" aria-label="Về trang chủ Board Game VN">
          <img className="auth-logo" src="/logo.jpg" alt="Board Game VN" />
        </Link>

        <Link className="auth-continue-link" to="/">Tiếp tục mà không có tài khoản</Link>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Tên tài khoản hoặc email
            <input type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Nhập tên tài khoản hoặc email" autoComplete="username" />
          </label>
          <label>
            Mật khẩu
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" autoComplete="current-password" />
          </label>
          {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
          <button className="primary-button full-width" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

          <Link className="auth-inline-link" to="/register">Chưa có tài khoản? Đăng ký ngay</Link>
        </form>

        <p className="auth-terms-note">
          Bằng cách tiếp tục, bạn đồng ý với{' '}
          <button className="auth-terms-link" type="button" onClick={() => setShowTerms(true)}>Điều khoản dịch vụ</button>{' '}
          của chúng tôi.
        </p>
      </div>

      {showTerms ? (
        <div className="auth-modal-backdrop" role="presentation" onClick={() => setShowTerms(false)}>
          <section className="auth-modal card-surface" role="dialog" aria-modal="true" aria-label="Điều khoản dịch vụ" onClick={(event) => event.stopPropagation()}>
            <div className="auth-modal-header">
              <h2>Điều khoản dịch vụ</h2>
              <button className="auth-modal-close" type="button" aria-label="Đóng điều khoản" onClick={() => setShowTerms(false)}>✕</button>
            </div>
            <div className="auth-modal-content">
              <p>Khi tiếp tục sử dụng website, bạn đồng ý cung cấp thông tin chính xác, tuân thủ quy định mua hàng và không sử dụng hệ thống cho mục đích trái phép.</p>
              <p>Chúng tôi có thể lưu trạng thái đăng nhập, lịch sử tìm kiếm và thông tin đơn hàng để cải thiện trải nghiệm người dùng.</p>
              <p>Đây là bản điều khoản mô phỏng cho chức năng giao diện; bạn có thể thay thế bằng nội dung pháp lý thật sau này.</p>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Login;
