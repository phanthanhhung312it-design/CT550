import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { createReview, useOrdersData, useRentalOrdersData, useReviewsData } from './useBoardgameApi';
import { products as fallbackProducts } from './boardgameData';
import { getAuthUser, isAuthenticated } from './auth';
import '../css/Orders.css';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ';
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('vi-VN');
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getOrderTitle(order, index) {
  return order.orderNumber || order.id || `DH-${index + 1}`;
}

function getRentalTitle(rental, index) {
  return rental.rentalNumber || rental.id || `DT-${index + 1}`;
}

function canSubmitReview(statusLabel) {
  const status = normalizeText(statusLabel);
  return ['hoan thanh', 'da giao', 'completed'].some((token) => status.includes(token));
}

function getOrderStatusMeta(statusLabel) {
  const normalized = normalizeText(statusLabel);

  if (normalized.includes('huy')) {
    return { icon: '🔴', label: 'Đã hủy', tone: 'cancelled' };
  }

  if (normalized.includes('hoan thanh')) {
    return { icon: '🟢', label: 'Đã hoàn thành', tone: 'success' };
  }

  if (normalized.includes('giao')) {
    return { icon: '🟢', label: 'Đang giao hàng', tone: 'info' };
  }

  if (normalized.includes('dong goi') || normalized.includes('xu ly')) {
    return { icon: '🟠', label: 'Đang đóng gói', tone: 'warning' };
  }

  if (normalized.includes('xac nhan')) {
    return { icon: '🟡', label: 'Đã xác nhận', tone: 'warning' };
  }

  return { icon: '🟠', label: 'Đã đặt hàng', tone: 'warning' };
}

function buildOrderTimeline(statusLabel) {
  const normalized = normalizeText(statusLabel);

  if (normalized.includes('huy')) {
    return [
      { key: 'placed', label: 'Đã đặt hàng', state: 'completed' },
      { key: 'cancelled', label: 'Đã hủy', state: 'current' },
    ];
  }

  const steps = ['Đã đặt hàng', 'Đã xác nhận', 'Đang đóng gói', 'Đang giao hàng', 'Đã hoàn thành'];
  let currentStep = 0;

  if (normalized.includes('hoan thanh')) {
    currentStep = 4;
  } else if (normalized.includes('giao')) {
    currentStep = 3;
  } else if (normalized.includes('dong goi') || normalized.includes('xu ly')) {
    currentStep = 2;
  } else if (normalized.includes('xac nhan')) {
    currentStep = 1;
  }

  return steps.map((label, index) => ({
    key: label,
    label,
    state: index < currentStep ? 'completed' : index === currentStep ? 'current' : 'upcoming',
  }));
}

function Orders() {
  const authState = getAuthUser();
  const authUser = authState?.user;
  const userId = authUser?.id || authUser?.userId || null;
  const customerDisplayName = authUser?.displayName || authUser?.fullName || authUser?.username || authUser?.email || 'Khách hàng';

  const orders = useOrdersData(userId);
  const rentals = useRentalOrdersData(userId);
  const myReviews = useReviewsData(userId);

  const [activeTab, setActiveTab] = useState('purchase');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Tất cả');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedRentalId, setSelectedRentalId] = useState('');
  const [reviewProductId, setReviewProductId] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');

  const orderRows = useMemo(() => {
    const source = (Array.isArray(orders) ? orders : []).filter((order) => {
      const ownerId = order.userId ?? order.user_ma ?? order.customerId ?? null;
      return userId ? String(ownerId) === String(userId) : false;
    });

    return source.map((order, index) => {
      const rawItems = Array.isArray(order.items) && order.items.length > 0
        ? order.items
        : fallbackProducts.slice(0, 3).map((product) => ({
          productId: product.id,
          name: product.name,
          image: product.image,
          quantity: 1,
          price: product.price,
        }));

      const detailItems = rawItems.map((item, itemIndex) => {
        const matchedProduct = fallbackProducts.find((product) => String(product.id) === String(item.productId) || product.name === item.name || product.name === item.productName);
        const quantity = Number(item.quantity || item.ctdh_soluong || 1);
        const unitPrice = Number(item.price || item.ctdh_dongia || 0);

        return {
          ...item,
          key: `${item.name || item.productName || 'item'}-${itemIndex}`,
          name: item.name || item.productName || `Sản phẩm ${itemIndex + 1}`,
          image: item.image || matchedProduct?.image || '/image/logo.jpg',
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
          productId: item.productId || matchedProduct?.id || null,
        };
      });

      return {
        ...order,
        id: getOrderTitle(order, index),
        customerName: order.customerName || order.fullName || order.displayName || customerDisplayName,
        recipientName: order.customerName || order.fullName || order.displayName || customerDisplayName,
        phone: order.phone || order.customerPhone || '-',
        email: order.email || '-',
        address: order.address || order.shippingAddress || 'Chưa cập nhật',
        orderDate: order.dh_thoigiandathang || order.createdAt || order.date || '-',
        voucherCode: order.voucherCode || '',
        shippingFee: Number(order.shippingFee || 0),
        subtotalAmount: Number(order.subtotal || detailItems.reduce((sum, item) => sum + item.lineTotal, 0)),
        voucherDiscount: Number(order.voucherDiscount || 0),
        totalAmount: Number(order.total || order.totalAmount || order.dh_thanhtien || order.amount || 0),
        totalLabel: formatMoney(order.total || order.totalAmount || order.dh_thanhtien || order.amount || 0),
        paymentLabel: order.paymentMethod || (order.tt_ma === 2 ? 'MOMO' : order.tt_ma === 3 ? 'VNPay' : 'COD'),
        shippingLabel: order.shippingMethod || order.shippingProvider || order.shipping || 'Chưa xác định',
        statusLabel: order.status || 'Chờ xác nhận',
        update: order.update || 'Đơn hàng đang được cập nhật.',
        eta: order.eta || 'Nhân viên sẽ xử lý đơn hàng trong thời gian sớm nhất.',
        note: order.note || '',
        detailItems,
      };
    });
  }, [customerDisplayName, orders, userId]);

  const rentalRows = useMemo(() => {
    const source = (Array.isArray(rentals) ? rentals : []).filter((rental) => {
      const ownerId = rental.customerId ?? rental.userId ?? rental.user_ma ?? null;
      return userId ? String(ownerId) === String(userId) : false;
    });

    return source.map((rental, index) => ({
      ...rental,
      id: getRentalTitle(rental, index),
      rentalDate: rental.createdAt || rental.dt_ngaydat || '-',
      receiveDateLabel: rental.receiveDate || rental.dt_ngaybatdauthue || '-',
      returnDateLabel: rental.returnDate || rental.dt_ngayphailai || '-',
      totalRentalFeeLabel: formatMoney(rental.totalRentalFee || rental.dt_tongtienthue || 0),
      totalAmountLabel: formatMoney(rental.totalAmount || rental.dt_tongthanhtoan || 0),
      addressLabel: rental.address || 'Chưa cập nhật',
      paymentLabel: rental.paymentMethod || 'COD',
      paymentStatusLabel: rental.paymentStatus || rental.dt_trangthaithanhtoan || 'Chưa thanh toán',
      statusLabel: rental.status || rental.dt_trangthai || 'Chờ xác nhận',
      voucherCode: rental.voucherCode || '',
      shippingLabel: rental.shippingUnit || 'Chưa chọn',
      items: Array.isArray(rental.items) ? rental.items : [],
    }));
  }, [rentals, userId]);

  const filteredOrders = useMemo(() => {
    const query = normalizeText(searchTerm);

    return orderRows.filter((order) => {
      const matchesQuery = !query || normalizeText([order.id, order.paymentLabel, order.shippingLabel].join(' ')).includes(query);
      const matchesStatus = statusFilter === 'Tất cả' || normalizeText(order.statusLabel) === normalizeText(statusFilter);
      return matchesQuery && matchesStatus;
    });
  }, [orderRows, searchTerm, statusFilter]);

  const selectedOrder = useMemo(() => {
    if (!filteredOrders.length) {
      return null;
    }

    return filteredOrders.find((order) => String(order.id) === String(selectedOrderId)) || filteredOrders[0];
  }, [filteredOrders, selectedOrderId]);

  const selectedOrderSummary = useMemo(() => {
    if (!selectedOrder) {
      return null;
    }

    return {
      totalProducts: selectedOrder.detailItems.length,
      totalQuantity: selectedOrder.detailItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      subtotalAmount: selectedOrder.subtotalAmount,
      voucherDiscount: selectedOrder.voucherDiscount,
      shippingFee: selectedOrder.shippingFee,
      totalAmount: selectedOrder.totalAmount,
    };
  }, [selectedOrder]);

  const filteredRentals = useMemo(() => {
    const query = normalizeText(searchTerm);

    return rentalRows.filter((rental) => {
      const matchesQuery = !query || normalizeText([rental.id, rental.paymentLabel, rental.shippingLabel].join(' ')).includes(query);
      const matchesStatus = statusFilter === 'Tất cả' || normalizeText(rental.statusLabel) === normalizeText(statusFilter);
      return matchesQuery && matchesStatus;
    });
  }, [rentalRows, searchTerm, statusFilter]);

  const selectedRental = useMemo(() => {
    if (!filteredRentals.length) {
      return null;
    }

    return filteredRentals.find((rental) => String(rental.id) === String(selectedRentalId)) || filteredRentals[0];
  }, [filteredRentals, selectedRentalId]);

  const reviewProductOptions = useMemo(() => {
    if (!selectedOrder) {
      return [];
    }

    return selectedOrder.detailItems
      .filter((item) => item.productId)
      .map((item) => ({
        key: item.key,
        productId: item.productId,
        productName: item.name,
      }));
  }, [selectedOrder]);

  const reviewRows = useMemo(() => {
    const source = Array.isArray(myReviews) ? myReviews : [];
    return source.map((review, index) => ({
      ...review,
      id: review.id || index + 1,
      reviewCode: review.reviewCode || `DG-${String(review.id || index + 1).padStart(5, '0')}`,
      productName: review.productName || `Sản phẩm #${review.productId || '-'}`,
      statusLabel: review.status || 'Chờ duyệt',
    }));
  }, [myReviews]);

  const statusOptions = useMemo(() => {
    const source = activeTab === 'purchase' ? orderRows : rentalRows;
    return ['Tất cả', ...new Set(source.map((item) => item.statusLabel).filter(Boolean))];
  }, [activeTab, orderRows, rentalRows]);

  useEffect(() => {
    document.title = 'Đơn hàng của tôi | Board Game VN';
  }, []);

  useEffect(() => {
    setSearchTerm('');
    setStatusFilter('Tất cả');
  }, [activeTab]);

  useEffect(() => {
    if (!reviewProductOptions.length) {
      setReviewProductId('');
      return;
    }

    const hasCurrentSelection = reviewProductOptions.some((item) => String(item.productId) === String(reviewProductId));
    if (!hasCurrentSelection) {
      setReviewProductId(String(reviewProductOptions[0].productId));
    }
  }, [reviewProductId, reviewProductOptions]);

  async function handleSubmitReview(event) {
    event.preventDefault();

    if (!selectedOrder || !canSubmitReview(selectedOrder.statusLabel)) {
      return;
    }

    if (!reviewProductId || !reviewContent.trim() || !reviewRating) {
      setReviewError('Vui lòng chọn sản phẩm và nhập nội dung đánh giá.');
      return;
    }

    try {
      setReviewError('');
      setReviewMessage('');

      await createReview({
        userId,
        orderId: selectedOrder.id,
        productId: Number(reviewProductId),
        rating: Number(reviewRating),
        content: reviewContent.trim(),
      });

      setReviewContent('');
      setReviewMessage('Đã gửi đánh giá thành công.');
    } catch (error) {
      setReviewError(error.message || 'Không thể gửi đánh giá.');
    }
  }

  if (!isAuthenticated() || !authUser) {
    return <Navigate to="/login" replace />;
  }

  const activeCount = activeTab === 'purchase' ? filteredOrders.length : filteredRentals.length;

  return (
    <section className="orders-page">
      <header className="card-surface orders-hero">
        <div>
          <p className="eyebrow">Quản lý đơn hàng</p>
          <h2>Theo dõi đơn mua và đơn thuê của bạn</h2>
          <p>Chỉ hiển thị các đơn thuộc tài khoản hiện tại, bao gồm chi tiết thanh toán, giao hàng và trạng thái xử lý.</p>
        </div>
        <div className="orders-hero-metrics">
          <strong>{activeCount}</strong>
          <span>{activeTab === 'purchase' ? 'đơn mua' : 'đơn thuê'}</span>
        </div>
      </header>

      <div className="orders-tabs card-surface">
        <button type="button" className={`orders-tab ${activeTab === 'purchase' ? 'active' : ''}`} onClick={() => setActiveTab('purchase')}>Đơn mua</button>
        <button type="button" className={`orders-tab ${activeTab === 'rental' ? 'active' : ''}`} onClick={() => setActiveTab('rental')}>Đơn thuê</button>
      </div>

      <div className="orders-toolbar card-surface">
        <input
          className="orders-search"
          type="search"
          placeholder={activeTab === 'purchase' ? 'Tìm theo mã đơn mua hoặc thanh toán' : 'Tìm theo mã đơn thuê hoặc thanh toán'}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select className="orders-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>

      {activeTab === 'purchase' ? (
        <div className="orders-layout">
          <article className="card-surface orders-table-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Đơn mua</p>
                <h3>Danh sách đơn mua của tôi</h3>
              </div>
            </div>

            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Mã đơn hàng</th>
                    <th>Ngày đặt hàng</th>
                    <th>Danh sách sản phẩm</th>
                    <th>Tổng tiền</th>
                    <th>Thanh toán</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className={String(selectedOrder?.id) === String(order.id) ? 'is-selected' : ''}>
                      <td>{order.id}</td>
                      <td>{formatDate(order.orderDate)}</td>
                      <td>{order.detailItems.slice(0, 2).map((item) => item.name).join(', ')}{order.detailItems.length > 2 ? '...' : ''}</td>
                      <td>{order.totalLabel}</td>
                      <td>{order.paymentLabel}</td>
                      <td><span className="status-pill">{order.statusLabel}</span></td>
                      <td><button type="button" className="secondary-button" onClick={() => setSelectedOrderId(String(order.id))}>Xem chi tiết</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="card-surface orders-detail-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Chi tiết đơn mua</p>
                <h3>{selectedOrder ? selectedOrder.id : 'Chưa có đơn mua'}</h3>
              </div>
            </div>

            {selectedOrder ? (
              <>
                <div className="orders-detail-grid">
                  <div><span>Người nhận</span><strong>{selectedOrder.recipientName}</strong></div>
                  <div><span>Số điện thoại</span><strong>{selectedOrder.phone}</strong></div>
                  <div><span>Ngày đặt hàng</span><strong>{formatDateTime(selectedOrder.orderDate)}</strong></div>
                  <div><span>Phương thức thanh toán</span><strong>{selectedOrder.paymentLabel}</strong></div>
                  <div className="span-2"><span>Địa chỉ giao hàng</span><strong>{selectedOrder.address}</strong></div>
                  <div><span>Voucher áp dụng</span><strong>{selectedOrder.voucherCode || 'Không áp dụng'}</strong></div>
                  <div><span>Phí vận chuyển</span><strong>{formatMoney(selectedOrder.shippingFee)}</strong></div>
                  <div><span>Trạng thái đơn hàng</span><strong className={`orders-status-badge ${getOrderStatusMeta(selectedOrder.statusLabel).tone}`}>{getOrderStatusMeta(selectedOrder.statusLabel).icon} {getOrderStatusMeta(selectedOrder.statusLabel).label}</strong></div>
                  <div><span>Tổng tiền thanh toán</span><strong>{formatMoney(selectedOrder.totalAmount)}</strong></div>
                </div>

                <div className="orders-detail-section">
                  <h4>Danh sách sản phẩm</h4>
                  <div className="orders-item-list">
                    {selectedOrder.detailItems.map((item) => (
                      <article key={item.key} className="orders-item-row orders-item-card">
                        <img className="orders-item-image" src={item.image} alt={item.name} />
                        <div className="orders-item-copy">
                          <strong>{item.name}</strong>
                          <span>{formatMoney(item.unitPrice)} x {item.quantity}</span>
                        </div>
                        <strong className="orders-item-total">{formatMoney(item.lineTotal)}</strong>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="orders-detail-section">
                  <h4>Tiến trình xử lý</h4>
                  <div className="timeline">
                    {buildOrderTimeline(selectedOrder.statusLabel).map((step) => (
                      <div key={step.key} className={`timeline-item ${step.state}`}>
                        <div className="timeline-dot" />
                        <div>
                          <strong>{step.label}</strong>
                          {step.state === 'current' ? <p>{selectedOrder.update}</p> : null}
                          {step.state === 'current' ? <span>{selectedOrder.eta}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOrderSummary ? (
                  <div className="orders-detail-section">
                    <h4>Tóm tắt đơn hàng</h4>
                    <div className="orders-summary-grid">
                      <article><span>Tổng số sản phẩm</span><strong>{selectedOrderSummary.totalProducts}</strong></article>
                      <article><span>Tổng số lượng</span><strong>{selectedOrderSummary.totalQuantity}</strong></article>
                      <article><span>Tạm tính</span><strong>{formatMoney(selectedOrderSummary.subtotalAmount)}</strong></article>
                      <article><span>Tiền giảm</span><strong>-{formatMoney(selectedOrderSummary.voucherDiscount)}</strong></article>
                      <article><span>Phí vận chuyển</span><strong>{formatMoney(selectedOrderSummary.shippingFee)}</strong></article>
                      <article><span>Tổng thanh toán</span><strong>{formatMoney(selectedOrderSummary.totalAmount)}</strong></article>
                    </div>
                  </div>
                ) : null}

                {canSubmitReview(selectedOrder.statusLabel) ? (
                  <div className="orders-detail-section">
                    <h4>Đánh giá sản phẩm</h4>
                    <form className="orders-review-form" onSubmit={handleSubmitReview}>
                      <label>
                        Sản phẩm
                        <select value={reviewProductId} onChange={(event) => setReviewProductId(event.target.value)}>
                          {reviewProductOptions.map((item) => <option key={item.key} value={item.productId}>{item.productName}</option>)}
                        </select>
                      </label>
                      <label>
                        Số sao
                        <div
                          className="star-rating"
                          onMouseLeave={() => setHoverRating(0)}
                          aria-label={`Đánh giá ${reviewRating} sao`}
                        >
                          {[1, 2, 3, 4, 5].map((n) => {
                            const active = (hoverRating || reviewRating) >= n;
                            return (
                              <button
                                key={n}
                                type="button"
                                className={`star ${active ? 'filled' : ''}`}
                                onMouseEnter={() => setHoverRating(n)}
                                onClick={() => setReviewRating(n)}
                                aria-label={`${n} sao`}
                              >
                                ★
                              </button>
                            );
                          })}
                        </div>
                      </label>
                      <label className="span-2">
                        Nội dung đánh giá
                        <textarea rows="3" value={reviewContent} onChange={(event) => setReviewContent(event.target.value)} placeholder="Chia sẻ trải nghiệm của bạn" />
                      </label>
                      <div className="span-2 orders-review-actions">
                        <button type="submit" className="secondary-button">Gửi đánh giá sản phẩm</button>
                      </div>
                      {reviewMessage ? <p className="orders-review-message success">{reviewMessage}</p> : null}
                      {reviewError ? <p className="orders-review-message error">{reviewError}</p> : null}
                    </form>
                  </div>
                ) : null}
              </>
            ) : <p>Chưa có dữ liệu đơn mua.</p>}
          </aside>
        </div>
      ) : (
        <div className="orders-layout">
          <article className="card-surface orders-table-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Đơn thuê</p>
                <h3>Danh sách đơn thuê BoardGame</h3>
              </div>
            </div>

            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Mã đơn thuê</th>
                    <th>Ngày thuê</th>
                    <th>Thời gian thuê</th>
                    <th>Trả dự kiến</th>
                    <th>Tổng chi phí thuê</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRentals.map((rental) => (
                    <tr key={rental.id} className={String(selectedRental?.id) === String(rental.id) ? 'is-selected' : ''}>
                      <td>{rental.id}</td>
                      <td>{formatDate(rental.rentalDate)}</td>
                      <td>{rental.receiveDateLabel}</td>
                      <td>{rental.returnDateLabel}</td>
                      <td>{rental.totalAmountLabel}</td>
                      <td><span className="status-pill">{rental.statusLabel}</span></td>
                      <td><button type="button" className="secondary-button" onClick={() => setSelectedRentalId(String(rental.id))}>Xem chi tiết</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="card-surface orders-detail-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Chi tiết đơn thuê</p>
                <h3>{selectedRental ? selectedRental.id : 'Chưa có đơn thuê'}</h3>
              </div>
            </div>

            {selectedRental ? (
              <>
                <div className="orders-detail-grid">
                  <div><span>Ngày thuê</span><strong>{formatDate(selectedRental.rentalDate)}</strong></div>
                  <div><span>Thời gian bắt đầu thuê</span><strong>{selectedRental.receiveDateLabel}</strong></div>
                  <div><span>Thời gian trả dự kiến</span><strong>{selectedRental.returnDateLabel}</strong></div>
                  <div><span>Phương thức thanh toán</span><strong>{selectedRental.paymentLabel}</strong></div>
                  <div><span>Trạng thái thanh toán</span><strong>{selectedRental.paymentStatusLabel}</strong></div>
                  <div><span>Đơn vị vận chuyển</span><strong>{selectedRental.shippingLabel}</strong></div>
                  <div className="span-2"><span>Địa chỉ giao nhận</span><strong>{selectedRental.addressLabel}</strong></div>
                  <div><span>Voucher áp dụng</span><strong>{selectedRental.voucherCode || 'Không áp dụng'}</strong></div>
                  <div><span>Trạng thái đơn thuê</span><strong>{selectedRental.statusLabel}</strong></div>
                  <div><span>Tổng chi phí thuê</span><strong>{selectedRental.totalAmountLabel}</strong></div>
                </div>

                <div className="orders-detail-section">
                  <h4>Danh sách BoardGame thuê</h4>
                  <div className="orders-item-list">
                    {selectedRental.items.map((item, index) => (
                      <article className="orders-item-row" key={`${item.name || item.productName || index}`}>
                        <strong>{item.name || item.productName || `BoardGame ${index + 1}`}</strong>
                        <span>Số lượng: {item.quantity || 1}</span>
                        <span>Giá thuê/ngày: {formatMoney(item.rentalPricePerDay || 0)}</span>
                        <span>Tiền cọc: {formatMoney(item.depositPerItem || 0)}</span>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            ) : <p>Chưa có dữ liệu đơn thuê.</p>}
          </aside>
        </div>
      )}

      <section className="card-surface orders-table-card">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Đánh giá của tôi</p>
            <h3>Xem lại các đánh giá đã gửi</h3>
          </div>
        </div>

        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Mã đánh giá</th>
                <th>Sản phẩm</th>
                <th>Số sao</th>
                <th>Nội dung</th>
                <th>Ngày đánh giá</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((review) => (
                <tr key={review.id}>
                  <td>{review.reviewCode}</td>
                  <td>{review.productName}</td>
                  <td>{review.rating} ★</td>
                  <td>{review.content}</td>
                      <td>{formatDateTime(review.createdAt)}</td>
                  <td><span className="status-pill">{review.statusLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default Orders;
