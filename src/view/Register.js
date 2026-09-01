import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAuthUser, isAuthenticated, setAuthUser } from './auth';
import '../css/Login.css';

function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Đăng ký | Board Game VN';
  }, []);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate((getAuthUser()?.user?.role || '').toLowerCase() === 'admin' ? '/admin' : '/account', { replace: true });
    }
  }, [navigate]);

  function handleSubmit(event) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const trimmedPhone = phone.trim();
    const trimmedPassword = password;
    const trimmedConfirmPassword = confirmPassword;

    if (!trimmedEmail || !trimmedUsername || !trimmedPhone || !trimmedPassword || !trimmedConfirmPassword) {
      setErrorMessage('Vui lòng nhập đầy đủ thông tin đăng ký.');
      return;
    }

    if (trimmedPassword.length < 8) {
      setErrorMessage('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setErrorMessage('Mật khẩu và xác nhận mật khẩu không khớp.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: trimmedEmail,
        username: trimmedUsername,
        phone: trimmedPhone,
        password: trimmedPassword,
        confirmPassword: trimmedConfirmPassword,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message || 'Đăng ký không thành công.');
        }

        return payload;
      })
      .then(({ token, user }) => {
        setAuthUser({ token, user });
        navigate((user.role || '').toLowerCase() === 'admin' ? '/admin' : '/account', { replace: true });
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

        <div className="auth-form-actions">
          <h2>Đăng ký tài khoản mới</h2>
          <p className="auth-form-hint">Tài khoản mới sẽ được tạo với vai trò mặc định là Khách hàng.</p>
        </div>

        <form className="auth-form auth-form-wide" onSubmit={handleSubmit}>
          <div className="auth-form-grid">
            <label className="auth-field-full">
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Nhập email" autoComplete="email" />
            </label>
            <label>
              Tên tài khoản
              <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nhập tên tài khoản" autoComplete="username" />
            </label>
            <label>
              Số điện thoại
              <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Nhập số điện thoại" autoComplete="tel" />
            </label>
            <label>
              Mật khẩu
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" />
            </label>
            <label>
              Xác nhận mật khẩu
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
            </label>
          </div>

          {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}

          <button className="primary-button full-width" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>

          <Link className="auth-inline-link" to="/login">Đã có tài khoản? Đăng nhập</Link>
        </form>
      </div>
    </section>
  );
}

export default Register;