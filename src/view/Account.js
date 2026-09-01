import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { clearAuthUser, getAuthToken, getAuthUser, isAuthenticated, setAuthUser } from './auth';
import {
  createAccountAddress,
  deleteAccountAddress,
  setAccountDefaultAddress,
  updateAccountAddress,
  updateAccountPassword,
  updateAccountProfile,
  useOrdersData,
  useProductsData,
  useRentalOrdersData,
  useRentalOptionsData,
  useVoucherCatalog,
} from './useBoardgameApi';
import { removeFavorite, useFavoriteItemsState } from './favoriteStorage';
import ProductArtwork from './ProductArtwork';
import '../css/Account.css';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ';
}

function getVoucherStatusLabel(voucher) {
  const status = String(voucher?.status || '').toLowerCase();
  const endDate = voucher?.endDate ? new Date(voucher.endDate) : null;

  if (endDate && !Number.isNaN(endDate.getTime()) && endDate < new Date()) {
    return 'Hết hạn';
  }

  if (status.includes('expired')) {
    return 'Hết hạn';
  }
  if (status.includes('locked')) {
    return 'Đã khóa';
  }
  if (voucher?.assignment && Number(voucher.assignment.remainingUses || 0) <= 0) {
    return 'Đã sử dụng';
  }
  return 'Còn hiệu lực';
}

function formatVoucherDiscount(voucher) {
  const discountType = Number(voucher?.discountType || 2);
  const value = Number(voucher?.value || 0);
  if (discountType === 1) {
    return `Giảm ${value}%`;
  }
  return `Giảm ${formatMoney(value)}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('vi-VN');
}

function isAvatarImageLink(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  const normalized = text.split('?')[0].split('#')[0].toLowerCase();
  if (normalized.startsWith('data:image/jpeg') || normalized.startsWith('data:image/jpg')) {
    return true;
  }

  const hasImagePath = normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('/');
  return hasImagePath && (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg'));
}

const sectionItems = [
  { key: 'profile', label: 'Thông tin cá nhân' },
  { key: 'addresses', label: 'Địa chỉ giao hàng' },
  { key: 'favorites', label: 'Yêu thích' },
  { key: 'orders', label: 'Lịch sử đơn mua' },
  { key: 'rentals', label: 'Lịch sử thuê' },
  { key: 'vouchers', label: 'Voucher' },
];

function Account() {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState(getAuthUser());
  const authToken = getAuthToken();
  const authUser = authState?.user;
  const userId = authUser?.id || authUser?.userId || null;
  const products = useProductsData();
  const favoriteItems = useFavoriteItemsState();
  const orders = useOrdersData(userId);
  const rentals = useRentalOrdersData(userId);
  const rentalOptions = useRentalOptionsData(userId);
  const voucherCatalog = useVoucherCatalog(userId);
  const [activeSection, setActiveSection] = useState('profile');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [isSubmittingAddress, setIsSubmittingAddress] = useState(false);
  const [addressDraftId, setAddressDraftId] = useState(null);

  const [profileForm, setProfileForm] = useState({
    fullName: authUser?.displayName || authUser?.fullName || authUser?.username || '',
    email: authUser?.email || '',
    phone: authUser?.phone || '',
    avatar: authUser?.avatar || '',
  });
  const [addressForm, setAddressForm] = useState({
    recipientName: '',
    phone: '',
    addressLine: '',
    isDefault: false,
  });
  const [addresses, setAddresses] = useState([]);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    document.title = 'Tài khoản cá nhân | Board Game VN';
  }, []);

  useEffect(() => {
    function syncAuthState() {
      setAuthState(getAuthUser());
    }

    window.addEventListener('boardgamevn-auth-change', syncAuthState);
    return () => window.removeEventListener('boardgamevn-auth-change', syncAuthState);
  }, []);

  useEffect(() => {
    setProfileForm({
      fullName: authUser?.displayName || authUser?.fullName || authUser?.username || '',
      email: authUser?.email || '',
      phone: authUser?.phone || '',
      avatar: isAvatarImageLink(authUser?.avatar) ? authUser.avatar : '',
    });
    setIsLoadingProfile(false);
  }, [authUser?.avatar, authUser?.displayName, authUser?.email, authUser?.fullName, authUser?.phone, authUser?.username]);

  useEffect(() => {
    setAddresses(Array.isArray(rentalOptions.addresses) ? rentalOptions.addresses : []);
  }, [rentalOptions.addresses]);

  const orderHistory = useMemo(() => {
    const rows = Array.isArray(orders) ? orders : [];
    return rows.map((order, index) => ({
      id: order.orderNumber || order.id || `DH-${index + 1}`,
      createdAt: order.createdAt || order.date || order.dh_thoigiandathang || null,
      totalAmount: Number(order.total || order.totalAmount || order.amount || order.dh_thanhtien || 0),
      status: order.status || 'Chờ xác nhận',
    }));
  }, [orders]);

  const rentalHistory = useMemo(() => {
    const rows = Array.isArray(rentals) ? rentals : [];
    return rows.map((rental, index) => ({
      id: rental.rentalNumber || rental.id || `DT-${index + 1}`,
      createdAt: rental.createdAt || rental.rentalDate || rental.dt_ngaydat || null,
      duration: `${rental.receiveDate || rental.dt_ngaybatdauthue || '-'} - ${rental.returnDate || rental.dt_ngayphaitra || '-'}`,
      totalAmount: Number(rental.totalAmount || rental.totalRentalFee || rental.dt_tongthanhtoan || rental.dt_tongtienthue || 0),
      status: rental.status || rental.dt_trangthai || 'Chờ xác nhận',
    }));
  }, [rentals]);

  const allVouchers = useMemo(() => {
    const source = [...(voucherCatalog.publicVouchers || []), ...(voucherCatalog.privateVouchers || [])];
    const voucherMap = new Map();

    source.forEach((voucher) => {
      const key = `${voucher.scope || 'public'}-${voucher.code || voucher.id}`;
      if (!voucherMap.has(key)) {
        voucherMap.set(key, voucher);
      }
    });

    return [...voucherMap.values()].sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
  }, [voucherCatalog.privateVouchers, voucherCatalog.publicVouchers]);

  const favoriteProducts = useMemo(() => {
    const favoriteIdSet = new Set(favoriteItems.map((item) => Number(item)).filter((item) => item > 0));
    return products.filter((product) => favoriteIdSet.has(Number(product.id)));
  }, [favoriteItems, products]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setIsSubmittingProfile(true);

    try {
      if (profileForm.avatar && !isAvatarImageLink(profileForm.avatar)) {
        throw new Error('Ảnh đại diện phải là file .jpg hoặc .jpeg.');
      }

      const profile = await updateAccountProfile(profileForm, authToken);

      setProfileForm((current) => ({
        ...current,
        fullName: profile?.fullName || current.fullName,
        email: profile?.email || current.email,
        phone: profile?.phone || current.phone,
        avatar: profile?.avatar || current.avatar,
      }));

      setAuthUser({
        ...authState,
        user: {
          ...authState?.user,
          displayName: profile?.fullName || profileForm.fullName,
          email: profile?.email || profileForm.email,
          phone: profile?.phone || profileForm.phone,
          avatar: profile?.avatar || profileForm.avatar,
        },
      });

      setMessage('Đã cập nhật thông tin cá nhân thành công.');
    } catch (error) {
      setErrorMessage(error.message || 'Không thể cập nhật hồ sơ.');
    } finally {
      setIsSubmittingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setIsSubmittingPassword(true);

    try {
      await updateAccountPassword(passwordForm, authToken);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Đổi mật khẩu thành công.');
    } catch (error) {
      setErrorMessage(error.message || 'Không thể đổi mật khẩu.');
    } finally {
      setIsSubmittingPassword(false);
    }
  }

  function handleStartEditAddress(address) {
    setAddressDraftId(address.id);
    setAddressForm({
      recipientName: address.recipientName || '',
      phone: address.phone || '',
      addressLine: address.addressLine || '',
      isDefault: Boolean(address.isDefault),
    });
  }

  function handleResetAddressForm() {
    setAddressDraftId(null);
    setAddressForm({ recipientName: '', phone: '', addressLine: '', isDefault: false });
  }

  async function handleAddressSubmit(event) {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setIsSubmittingAddress(true);

    try {
      if (addressDraftId) {
        const updated = await updateAccountAddress(addressDraftId, addressForm, authToken);
        setAddresses((current) => {
          const next = current.map((item) => (String(item.id) === String(updated.id) ? updated : item));
          return updated.isDefault
            ? next.map((item) => ({ ...item, isDefault: String(item.id) === String(updated.id) }))
            : next;
        });
        setMessage('Đã cập nhật địa chỉ giao hàng.');
      } else {
        const created = await createAccountAddress(addressForm, authToken);
        setAddresses((current) => {
          const next = [created, ...current];
          return created.isDefault
            ? next.map((item) => ({ ...item, isDefault: String(item.id) === String(created.id) }))
            : next;
        });
        setMessage('Đã thêm địa chỉ giao hàng mới.');
      }

      handleResetAddressForm();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể lưu địa chỉ.');
    } finally {
      setIsSubmittingAddress(false);
    }
  }

  async function handleDeleteAddress(addressId) {
    setMessage('');
    setErrorMessage('');

    try {
      await deleteAccountAddress(addressId, authToken);
      setAddresses((current) => current.filter((item) => String(item.id) !== String(addressId)));
      if (String(addressDraftId) === String(addressId)) {
        handleResetAddressForm();
      }
      setMessage('Đã xóa địa chỉ giao hàng.');
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xóa địa chỉ.');
    }
  }

  async function handleSetDefaultAddress(addressId) {
    setMessage('');
    setErrorMessage('');

    try {
      const updated = await setAccountDefaultAddress(addressId, authToken);
      setAddresses((current) => current.map((item) => ({
        ...item,
        isDefault: String(item.id) === String(updated.id),
      })));
      setMessage('Đã cập nhật địa chỉ mặc định.');
    } catch (error) {
      setErrorMessage(error.message || 'Không thể đặt địa chỉ mặc định.');
    }
  }

  function handleLogout() {
    clearAuthUser();
    navigate('/');
  }

  function handleRemoveFavorite(productId, productName) {
    removeFavorite(productId);
    setMessage(`Đã xóa ${productName} khỏi danh sách yêu thích.`);
    setErrorMessage('');
  }

  if (!isAuthenticated() || !authUser) {
    return <Navigate to="/login" replace />;
  }

  if ((authUser.role || '').toLowerCase() === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  function renderProfileSection() {
    return (
      <article className="card-surface account-content-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Thông tin cá nhân</p>
            <h3>Cập nhật hồ sơ tài khoản</h3>
          </div>
        </div>

        <form className="account-form" onSubmit={handleProfileSubmit}>
          <label>
            Họ và tên
            <input value={profileForm.fullName} onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))} />
          </label>
          <label>
            Email
            <input type="email" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label>
            Số điện thoại
            <input value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label>
            Ảnh đại diện
            <input
              type="file"
              accept="image/jpeg,.jpg,.jpeg"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                const fileName = file.name.toLowerCase();
                if (!fileName.endsWith('.jpg') && !fileName.endsWith('.jpeg')) {
                  setErrorMessage('Chỉ chấp nhận file ảnh .jpg hoặc .jpeg.');
                  return;
                }

                const reader = new FileReader();
                reader.onload = () => {
                  setProfileForm((current) => ({ ...current, avatar: String(reader.result || '') }));
                  setErrorMessage('');
                };
                reader.readAsDataURL(file);
              }}
            />
            <small>Chọn file ảnh .jpg hoặc .jpeg để hiển thị đại diện.</small>
          </label>
          <div className="account-form-actions span-2">
            <button className="primary-button" type="submit" disabled={isSubmittingProfile}>
              {isSubmittingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
            </button>
          </div>
        </form>

        <form className="account-form account-password-form" onSubmit={handlePasswordSubmit}>
          <h4>Đổi mật khẩu</h4>
          <label>
            Mật khẩu hiện tại
            <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
          </label>
          <label>
            Mật khẩu mới
            <input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
          </label>
          <label>
            Xác nhận mật khẩu mới
            <input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
          </label>
          <div className="account-form-actions span-2">
            <button className="secondary-button" type="submit" disabled={isSubmittingPassword}>
              {isSubmittingPassword ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
            </button>
          </div>
        </form>
      </article>
    );
  }

  function renderAddressSection() {
    return (
      <article className="card-surface account-content-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Địa chỉ giao hàng</p>
            <h3>Thêm mới, chỉnh sửa, xóa và đặt mặc định</h3>
          </div>
        </div>

        <form className="account-form" onSubmit={handleAddressSubmit}>
          <label>
            Người nhận
            <input value={addressForm.recipientName} onChange={(event) => setAddressForm((current) => ({ ...current, recipientName: event.target.value }))} />
          </label>
          <label>
            Số điện thoại
            <input value={addressForm.phone} onChange={(event) => setAddressForm((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label className="span-2">
            Địa chỉ chi tiết
            <textarea value={addressForm.addressLine} onChange={(event) => setAddressForm((current) => ({ ...current, addressLine: event.target.value }))} rows={3} />
          </label>
          <label className="account-checkbox span-2">
            <input type="checkbox" checked={addressForm.isDefault} onChange={(event) => setAddressForm((current) => ({ ...current, isDefault: event.target.checked }))} />
            Đặt làm địa chỉ mặc định
          </label>
          <div className="account-form-actions span-2">
            <button className="primary-button" type="submit" disabled={isSubmittingAddress}>
              {isSubmittingAddress ? 'Đang lưu...' : addressDraftId ? 'Cập nhật địa chỉ' : 'Thêm địa chỉ'}
            </button>
            {addressDraftId ? (
              <button className="ghost-button" type="button" onClick={handleResetAddressForm}>Hủy chỉnh sửa</button>
            ) : null}
          </div>
        </form>

        <div className="account-list">
          {addresses.length > 0 ? addresses.map((address) => (
            <article key={address.id} className="account-list-item account-address-item">
              <div>
                <strong>{address.recipientName}</strong>
                <p>{address.phone}</p>
                <p>{address.addressLine}</p>
                {address.isDefault ? <span className="account-default-badge">Mặc định</span> : null}
              </div>
              <div className="account-inline-actions">
                <button className="secondary-button" type="button" onClick={() => handleStartEditAddress(address)}>Sửa</button>
                {!address.isDefault ? (
                  <button className="ghost-button" type="button" onClick={() => handleSetDefaultAddress(address.id)}>Đặt mặc định</button>
                ) : null}
                <button className="ghost-button danger" type="button" onClick={() => handleDeleteAddress(address.id)}>Xóa</button>
              </div>
            </article>
          )) : <p>Chưa có địa chỉ giao hàng nào.</p>}
        </div>
      </article>
    );
  }

  function renderOrderSection() {
    return (
      <article className="card-surface account-content-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Lịch sử đơn mua</p>
            <h3>Theo dõi tất cả đơn hàng đã đặt</h3>
          </div>
          <button className="secondary-button" type="button" onClick={() => navigate('/orders')}>Xem chi tiết đầy đủ</button>
        </div>

        <div className="account-list">
          {orderHistory.length > 0 ? orderHistory.map((order) => (
            <article key={order.id} className="account-list-item">
              <div>
                <strong>{order.id}</strong>
                <p>Ngày đặt: {formatDate(order.createdAt)}</p>
                <p>Trạng thái: {order.status}</p>
              </div>
              <div className="account-history-right">
                <span>{formatMoney(order.totalAmount)}</span>
                <button className="primary-button" type="button" onClick={() => navigate('/orders')}>Xem chi tiết</button>
              </div>
            </article>
          )) : <p>Bạn chưa có đơn mua nào.</p>}
        </div>
      </article>
    );
  }

  function renderFavoriteSection() {
    return (
      <article className="card-surface account-content-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Yêu thích</p>
            <h3>Danh sách board game bạn đã lưu</h3>
          </div>
          <button className="secondary-button" type="button" onClick={() => navigate('/catalog')}>Mở danh mục</button>
        </div>

        <div className="account-favorite-grid">
          {favoriteProducts.length > 0 ? favoriteProducts.map((product) => (
            <article key={product.id} className="account-favorite-card">
              <Link className="account-favorite-link" to={`/product/${product.id}`}>
                <ProductArtwork product={product} className="account-favorite-image" />
                <div className="account-favorite-body">
                  <span className="category-pill">{product.category}</span>
                  <strong>{product.name}</strong>
                  <p>{product.description}</p>
                  <div className="chip-row">
                    <span>{Number(product.rating || 0).toFixed(1)} ★</span>
                    <span>{Number(product.reviews || 0)} đánh giá</span>
                    <span>Tồn kho: {Number(product.stock || 0)}</span>
                  </div>
                  <strong className="account-favorite-price">{formatMoney(product.price)}</strong>
                </div>
              </Link>
              <div className="account-inline-actions">
                <button className="primary-button" type="button" onClick={() => navigate(`/product/${product.id}`)}>Xem chi tiết</button>
                <button className="ghost-button danger" type="button" onClick={() => handleRemoveFavorite(product.id, product.name)}>Bỏ yêu thích</button>
              </div>
            </article>
          )) : <p>Bạn chưa lưu board game nào vào danh sách yêu thích.</p>}
        </div>
      </article>
    );
  }

  function renderRentalSection() {
    return (
      <article className="card-surface account-content-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Lịch sử thuê</p>
            <h3>Theo dõi các đơn thuê BoardGame</h3>
          </div>
          <button className="secondary-button" type="button" onClick={() => navigate('/orders')}>Xem chi tiết đầy đủ</button>
        </div>

        <div className="account-list">
          {rentalHistory.length > 0 ? rentalHistory.map((rental) => (
            <article key={rental.id} className="account-list-item">
              <div>
                <strong>{rental.id}</strong>
                <p>Ngày thuê: {formatDate(rental.createdAt)}</p>
                <p>Thời gian thuê: {rental.duration}</p>
                <p>Trạng thái: {rental.status}</p>
              </div>
              <div className="account-history-right">
                <span>{formatMoney(rental.totalAmount)}</span>
                <button className="primary-button" type="button" onClick={() => navigate('/orders')}>Xem chi tiết</button>
              </div>
            </article>
          )) : <p>Bạn chưa có đơn thuê nào.</p>}
        </div>
      </article>
    );
  }

  function renderVoucherSection() {
    return (
      <article className="card-surface account-content-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Voucher</p>
            <h3>Voucher công khai và voucher được cấp riêng</h3>
          </div>
        </div>

        <div className="voucher-grid">
          {allVouchers.length > 0 ? allVouchers.map((voucher) => (
            <article key={`${voucher.scope || 'public'}-${voucher.code || voucher.id}`} className="voucher-item">
              <strong>{voucher.title}</strong>
              <span>Mã: {voucher.code}</span>
              <span>Giá trị: {formatVoucherDiscount(voucher)}</span>
              <span>Điều kiện: Đơn tối thiểu {formatMoney(voucher.minAmount || 0)}</span>
              <span>Hết hạn: {voucher.endDate ? formatDate(voucher.endDate) : 'Không giới hạn'}</span>
              <span>Trạng thái: {getVoucherStatusLabel(voucher)}</span>
            </article>
          )) : <p>Bạn chưa có voucher khả dụng.</p>}
        </div>
      </article>
    );
  }

  return (
    <section className="account-page">
      <header className="card-surface account-hero">
        <div className="account-avatar">
          {isAvatarImageLink(authUser.avatar) ? (
            <img src={authUser.avatar} alt="Ảnh đại diện" className="account-avatar-image" />
          ) : (
            authUser.avatar || '👤'
          )}
        </div>
        <div className="account-hero-copy">
          <p className="eyebrow account-hero-eyebrow">Quản lý tài khoản cá nhân</p>
          <h2 className="account-hero-title">{authUser.displayName || authUser.fullName || authUser.username || 'Khách hàng'}</h2>
          <p>{authUser.email ? `Email: ${authUser.email}` : 'Bạn đang đăng nhập bằng tên tài khoản.'}</p>
          <p>Vai trò: {(authUser.role || '').toLowerCase() === 'admin' ? 'Admin' : 'Customer'}</p>
        </div>
        <div className="account-actions">
          <button className="primary-button" type="button" onClick={() => navigate('/orders')}>Đơn hàng của tôi</button>
          <button className="secondary-button" type="button" onClick={handleLogout}>Đăng xuất</button>
        </div>
      </header>

      {message ? <p className="account-message card-surface success">{message}</p> : null}
      {errorMessage ? <p className="account-message card-surface error">{errorMessage}</p> : null}

      <div className="account-shell">
        <aside className="card-surface account-nav">
          <h3>Quản lý tài khoản</h3>
          <div className="account-nav-list">
            {sectionItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`account-nav-item ${activeSection === item.key ? 'active' : ''}`}
                onClick={() => setActiveSection(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="account-main">
          {isLoadingProfile ? <p className="card-surface account-content-panel">Đang tải dữ liệu tài khoản...</p> : null}
          {!isLoadingProfile && activeSection === 'profile' ? renderProfileSection() : null}
          {!isLoadingProfile && activeSection === 'addresses' ? renderAddressSection() : null}
          {!isLoadingProfile && activeSection === 'favorites' ? renderFavoriteSection() : null}
          {!isLoadingProfile && activeSection === 'orders' ? renderOrderSection() : null}
          {!isLoadingProfile && activeSection === 'rentals' ? renderRentalSection() : null}
          {!isLoadingProfile && activeSection === 'vouchers' ? renderVoucherSection() : null}
        </div>
      </div>
    </section>
  );
}

export default Account;
