import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthUser, isAuthenticated } from './auth';
import { createRentalOrder, useRentalOptionsData, useRentalOrdersData, useRentalProductsData, validateVoucher } from './useBoardgameApi';
import { applyVoucher, normalizeVoucherItem, resolveVoucherErrorMessage } from './voucherUtils';
import '../css/Rental.css';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ';
}

function calculateDays(receiveDate, returnDate) {
  if (!receiveDate || !returnDate) {
    return 0;
  }

  const startDate = new Date(receiveDate);
  const endDate = new Date(returnDate);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
}

function getShippingFee(unit) {
  return Number(unit?.fee || 0);
}

function Rental() {
  const authState = getAuthUser();
  const authUser = authState?.user;
  const userId = authUser?.id || authUser?.userId || null;

  const rentalProducts = useRentalProductsData();
  const rentalHistory = useRentalOrdersData(userId);
  const rentalOptions = useRentalOptionsData(userId);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tất cả');
  const [playersFilter, setPlayersFilter] = useState('Tất cả');
  const [priceFilter, setPriceFilter] = useState('Tất cả');
  const [cartItems, setCartItems] = useState([]);
  const [receiveDate, setReceiveDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [addressId, setAddressId] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [shippingUnitId, setShippingUnitId] = useState('');
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherApplying, setVoucherApplying] = useState(false);
  const [voucherMessage, setVoucherMessage] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [note, setNote] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('Tất cả');
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(45);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [pendingQrImage, setPendingQrImage] = useState('');
  const [pendingPaymentLabel, setPendingPaymentLabel] = useState('');

  const categories = useMemo(
    () => ['Tất cả', ...new Set(rentalProducts.map((product) => product.category).filter(Boolean))],
    [rentalProducts]
  );

  const playersOptions = useMemo(
    () => ['Tất cả', ...new Set(rentalProducts.map((product) => product.players).filter(Boolean))],
    [rentalProducts]
  );

  const filteredProducts = useMemo(() => {
    const query = normalizeText(searchTerm);

    return rentalProducts.filter((product) => {
      const rentalPricePerDay = Number(product.rentalPricePerDay || 0);
      const matchesQuery = !query || normalizeText([product.name, product.category, product.players].join(' ')).includes(query);
      const matchesCategory = categoryFilter === 'Tất cả' || product.category === categoryFilter;
      const matchesPlayers = playersFilter === 'Tất cả' || product.players === playersFilter;
      const matchesPrice = priceFilter === 'Tất cả'
        || (priceFilter === 'under50' && rentalPricePerDay < 50000)
        || (priceFilter === '50to100' && rentalPricePerDay >= 50000 && rentalPricePerDay <= 100000)
        || (priceFilter === 'over100' && rentalPricePerDay > 100000);

      return matchesQuery && matchesCategory && matchesPlayers && matchesPrice;
    });
  }, [categoryFilter, playersFilter, priceFilter, rentalProducts, searchTerm]);

  const voucherPool = useMemo(() => {
    const merged = (Array.isArray(rentalOptions.vouchers) ? rentalOptions.vouchers : [])
      .map((voucher) => normalizeVoucherItem(voucher))
      .filter((voucher) => voucher.code && String(voucher.status || '').toLowerCase() !== 'expired');

    return [...new Map(merged.map((voucher) => [voucher.code, voucher])).values()];
  }, [rentalOptions.vouchers]);

  const selectedPaymentMethod = useMemo(
    () => rentalOptions.paymentMethods.find((payment) => String(payment.id) === String(paymentMethodId)) || null,
    [paymentMethodId, rentalOptions.paymentMethods]
  );

  const selectedAddress = useMemo(
    () => rentalOptions.addresses.find((address) => String(address.id) === String(addressId)) || null,
    [addressId, rentalOptions.addresses]
  );

  const selectedShippingUnit = useMemo(
    () => rentalOptions.shippingUnits.find((unit) => String(unit.id) === String(shippingUnitId)) || null,
    [rentalOptions.shippingUnits, shippingUnitId]
  );

  const rentalDays = useMemo(() => calculateDays(receiveDate, returnDate), [receiveDate, returnDate]);

  const summary = useMemo(() => {
    const subtotalRental = cartItems.reduce((total, item) => total + (item.rentalPricePerDay * rentalDays * item.quantity), 0);
    const subtotalDeposit = cartItems.reduce((total, item) => total + (item.deposit * item.quantity), 0);
    const shippingFee = getShippingFee(selectedShippingUnit);
    const discount = applyVoucher(subtotalRental, appliedVoucher);
    const total = subtotalRental + subtotalDeposit + shippingFee - discount;

    return {
      subtotalRental,
      subtotalDeposit,
      shippingFee,
      discount,
      total,
    };
  }, [appliedVoucher, cartItems, rentalDays, selectedShippingUnit]);

  useEffect(() => {
    if (!appliedVoucher?.code) {
      return undefined;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      try {
        const result = await validateVoucher({
          voucherCode: appliedVoucher.code,
          userId,
          subtotal: summary.subtotalRental,
        });

        if (!active) {
          return;
        }

        if (!result.isValid) {
          setAppliedVoucher(null);
          setVoucherInput('');
          setVoucherMessage(resolveVoucherErrorMessage(result.message));
          return;
        }

        const discount = applyVoucher(summary.subtotalRental, result.voucher || appliedVoucher);
        setVoucherMessage(`Đã áp dụng voucher ${result.voucher?.code || appliedVoucher.code}, giảm ${formatMoney(discount)}.`);
      } catch (error) {
        if (!active) {
          return;
        }

        setAppliedVoucher(null);
        setVoucherInput('');
        setVoucherMessage(resolveVoucherErrorMessage(error.message || 'Không có mã voucher này'));
      }
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [appliedVoucher, summary.subtotalRental, userId]);

  async function handleApplyVoucher(codeOverride) {
    const code = String(codeOverride ?? voucherInput ?? '').trim().toUpperCase();

    if (!code) {
      setAppliedVoucher(null);
      setVoucherMessage('');
      return;
    }

    setVoucherApplying(true);
    setVoucherMessage('');

    try {
      const result = await validateVoucher({
        voucherCode: code,
        userId,
        subtotal: summary.subtotalRental,
      });

      if (!result.isValid) {
        setAppliedVoucher(null);
        setVoucherInput(code);
        setVoucherMessage(resolveVoucherErrorMessage(result.message));
        return;
      }

      const nextVoucher = result.voucher || voucherPool.find((item) => normalizeText(item.code) === normalizeText(code)) || null;
      setAppliedVoucher(nextVoucher);
      setVoucherInput(nextVoucher?.code || code);
      const discount = applyVoucher(summary.subtotalRental, nextVoucher);
      setVoucherMessage(`Đã áp dụng voucher ${nextVoucher?.code || code}, giảm ${formatMoney(discount)}.`);
    } catch (error) {
      setAppliedVoucher(null);
      setVoucherInput(code);
      setVoucherMessage(resolveVoucherErrorMessage(error.message || 'Không có mã voucher này'));
    } finally {
      setVoucherApplying(false);
    }
  }

  const statusOptions = useMemo(
    () => ['Tất cả', ...new Set(historyData.map((item) => item.status || 'Chờ xác nhận'))],
    [historyData]
  );

  const filteredHistory = useMemo(() => {
    const query = normalizeText(historyQuery);

    return historyData.filter((item) => {
      const matchesQuery = !query || normalizeText([
        item.rentalNumber,
        item.customerName,
        item.paymentMethod,
      ].join(' ')).includes(query);
      const matchesStatus = historyStatusFilter === 'Tất cả' || normalizeText(item.status) === normalizeText(historyStatusFilter);

      return matchesQuery && matchesStatus;
    });
  }, [historyData, historyQuery, historyStatusFilter]);

  const selectedHistory = useMemo(() => {
    if (!filteredHistory.length) {
      return null;
    }

    return filteredHistory.find((item) => String(item.id) === String(selectedHistoryId)) || filteredHistory[0];
  }, [filteredHistory, selectedHistoryId]);

  useEffect(() => {
    document.title = 'Thuê BoardGame | Board Game VN';
  }, []);

  useEffect(() => {
    setHistoryData(Array.isArray(rentalHistory) ? rentalHistory : []);
  }, [rentalHistory]);

  useEffect(() => {
    if (rentalOptions.addresses.length > 0 && (!addressId || !rentalOptions.addresses.some((address) => String(address.id) === String(addressId)))) {
      const defaultAddress = rentalOptions.addresses.find((address) => address.isDefault) || rentalOptions.addresses[0];
      setAddressId(String(defaultAddress.id));
    }

    if (rentalOptions.paymentMethods.length > 0 && !paymentMethodId) {
      setPaymentMethodId(String(rentalOptions.paymentMethods[0].id));
    }

    if (rentalOptions.shippingUnits.length > 0 && !shippingUnitId) {
      setShippingUnitId(String(rentalOptions.shippingUnits[0].id));
    }
  }, [addressId, paymentMethodId, rentalOptions.addresses, rentalOptions.paymentMethods, rentalOptions.shippingUnits, shippingUnitId]);

  useEffect(() => {
    if (!isQrModalOpen) {
      return undefined;
    }

    setQrCountdown(45);
    const intervalId = window.setInterval(() => {
      setQrCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          setIsQrModalOpen(false);
          setPendingPayload(null);
          setPendingQrImage('');
          setPendingPaymentLabel('');
          setStatusMessage('Hết thời gian chờ thanh toán QR, vui lòng xác nhận thanh toán lại nếu cần.');
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isQrModalOpen]);

  function handleAddToCart(product) {
    setStatusMessage('');
    setErrorMessage('');

    setCartItems((current) => {
      const exists = current.find((item) => item.productId === product.productId);

      if (exists) {
        return current.map((item) => (
          item.productId === product.productId
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item
        ));
      }

      return [
        ...current,
        {
          ...product,
          quantity: 1,
        },
      ];
    });

    setStatusMessage(`Đã thêm ${product.name} vào đơn thuê.`);
  }

  function handleChangeQuantity(productId, nextQuantity) {
    const quantity = Math.max(1, Number(nextQuantity || 1));

    setCartItems((current) => current.map((item) => {
      if (item.productId !== productId) {
        return item;
      }

      return {
        ...item,
        quantity: Math.min(quantity, item.stock || quantity),
      };
    }));
  }

  function handleRemoveCartItem(productId) {
    setCartItems((current) => current.filter((item) => item.productId !== productId));
  }

  function buildRentalPayload() {
    return {
      userId,
      receiveDate,
      returnDate,
      addressId: Number(addressId),
      paymentMethodId: Number(paymentMethodId),
      shippingUnitId: Number(shippingUnitId),
      shippingFee: summary.shippingFee,
      voucherCode: appliedVoucher?.code || null,
      note,
      items: cartItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        rentalPricePerDay: item.rentalPricePerDay,
        depositPerItem: item.deposit,
      })),
    };
  }

  async function submitRentalOrder(payload) {
    const createdOrder = await createRentalOrder(payload);

    setStatusMessage(`Đặt thuê thành công: ${createdOrder.rentalNumber}.`);
    setCartItems([]);
    setVoucherInput('');
    setAppliedVoucher(null);
    setVoucherMessage('');
    setNote('');
    setHistoryData((current) => [createdOrder, ...current]);
    setSelectedHistoryId(String(createdOrder.id));
  }

  async function handleConfirmQrPayment() {
    if (!pendingPayload) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await submitRentalOrder(pendingPayload);
      setIsQrModalOpen(false);
      setPendingPayload(null);
      setPendingQrImage('');
      setPendingPaymentLabel('');
      setStatusMessage('Thanh toán thành công. Đơn thuê đã được tạo.');
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xác nhận thanh toán.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitRental(event) {
    event.preventDefault();

    if (!isAuthenticated()) {
      setErrorMessage('Vui lòng đăng nhập để tạo đơn thuê board game.');
      return;
    }

    if (!receiveDate || !returnDate) {
      setErrorMessage('Vui lòng chọn ngày nhận và ngày trả.');
      return;
    }

    if (calculateDays(receiveDate, returnDate) <= 0) {
      setErrorMessage('Ngày trả phải sau ngày nhận.');
      return;
    }

    if (cartItems.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất một board game vào đơn thuê.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const payload = buildRentalPayload();
      const paymentName = normalizeText(selectedPaymentMethod?.name || '');
      const paymentNameCompact = paymentName.replace(/\s+/g, '');
      const isMomoPayment = paymentNameCompact.includes('momo');
      const isVnpayPayment = paymentNameCompact.includes('vnpay');
      const needsQrPayment = isMomoPayment || isVnpayPayment;

      if (needsQrPayment) {
        const qrImage = isMomoPayment ? '/image/MoMo.jpg' : '/image/MB.jpg';
        setPendingPayload(payload);
        setPendingQrImage(qrImage);
        setPendingPaymentLabel(selectedPaymentMethod?.name || 'Ví điện tử');
        setIsQrModalOpen(true);
        setStatusMessage('Đã mở mã QR, vui lòng hoàn tất thanh toán để tạo đơn thuê.');
      } else {
        await submitRentalOrder(payload);
      }
    } catch (error) {
      setErrorMessage(error.message || 'Không thể tạo đơn thuê.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAuthenticated()) {
    return (
      <section className="rental-page">
        <header className="card-surface rental-hero">
          <div>
            <p className="eyebrow">Thuê BoardGame</p>
            <h2>Đăng nhập để bắt đầu thuê board game</h2>
            <p>Bạn cần tài khoản khách hàng để tạo đơn thuê, theo dõi trạng thái và lịch sử thuê.</p>
          </div>
          <Link className="primary-button" to="/login">Đăng nhập ngay</Link>
        </header>
      </section>
    );
  }

  return (
    <section className="rental-page">
      <header className="card-surface rental-hero">
        <div>
          <p className="eyebrow">Thuê BoardGame</p>
          <h2>Chọn board game và đặt thuê trực tuyến</h2>
          <p>Xem giá thuê, tiền cọc, chọn ngày nhận trả và theo dõi toàn bộ lịch sử thuê của bạn.</p>
        </div>
        <div className="rental-hero-metrics">
          <strong>{cartItems.length}</strong>
          <span>sản phẩm đang chọn</span>
        </div>
      </header>

      {statusMessage ? <p className="admin-message success">{statusMessage}</p> : null}
      {errorMessage ? <p className="admin-message error">{errorMessage}</p> : null}

      <div className="rental-toolbar card-surface">
        <input
          className="rental-search"
          type="search"
          placeholder="Tìm theo tên game, danh mục hoặc số người chơi"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select className="rental-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="rental-select" value={playersFilter} onChange={(event) => setPlayersFilter(event.target.value)}>
          {playersOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="rental-select" value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}>
          <option value="Tất cả">Tất cả mức giá thuê</option>
          <option value="under50">Dưới 50.000 đ/ngày</option>
          <option value="50to100">Từ 50.000 đến 100.000 đ/ngày</option>
          <option value="over100">Trên 100.000 đ/ngày</option>
        </select>
      </div>

      <div className="rental-layout">
        <article className="card-surface rental-products-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Danh sách board game cho thuê</p>
              <h3>Sẵn sàng thuê</h3>
            </div>
            <span>{filteredProducts.length} sản phẩm</span>
          </div>

          <div className="rental-product-grid">
            {filteredProducts.map((product) => (
              <article key={product.productId} className="rental-product-item">
                <div className="rental-product-image">
                  <img src={product.image} alt={product.name} loading="lazy" />
                </div>
                <div className="rental-product-content">
                  <h4>{product.name}</h4>
                  <p>{product.category} | {product.players} người chơi</p>
                  <strong>{formatMoney(product.rentalPricePerDay)}/ngày</strong>
                  <span>Tiền cọc: {formatMoney(product.deposit)}</span>
                  <span>Còn lại: {product.stock}</span>
                  <button type="button" className="secondary-button" onClick={() => handleAddToCart(product)}>Thêm vào đơn thuê</button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="card-surface rental-checkout-card">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Biểu mẫu đặt thuê</p>
              <h3>Tạo đơn thuê mới</h3>
            </div>
          </div>

          <form className="rental-form" onSubmit={handleSubmitRental}>
            <label>
              Ngày nhận
              <input type="date" value={receiveDate} onChange={(event) => setReceiveDate(event.target.value)} required />
            </label>
            <label>
              Ngày trả
              <input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required />
            </label>
            <label className="span-2 rental-address-field">
              Địa chỉ giao hàng
              <select value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                {rentalOptions.addresses.map((address) => (
                  <option key={address.id} value={address.id}>{address.recipientName} - {address.phone || 'Chưa có số điện thoại'}</option>
                ))}
              </select>
            </label>
            {selectedAddress ? (
              <div className="span-2 rental-address-preview">
                <strong>{selectedAddress.recipientName}</strong>
                <span>{selectedAddress.phone || 'Chưa có số điện thoại'}</span>
                <span>{selectedAddress.addressLine}</span>
              </div>
            ) : null}
            <label>
              Phương thức thanh toán
              <select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
                {rentalOptions.paymentMethods.map((payment) => (
                  <option key={payment.id} value={payment.id}>{payment.name}</option>
                ))}
              </select>
            </label>
            <label>
              Đơn vị vận chuyển
              <select value={shippingUnitId} onChange={(event) => setShippingUnitId(event.target.value)}>
                {rentalOptions.shippingUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name} - {formatMoney(unit.fee || 0)}</option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Voucher
              <div className="rental-voucher-row">
                <input
                  type="text"
                  value={voucherInput}
                  onChange={(event) => setVoucherInput(event.target.value.trim().toUpperCase())}
                  placeholder="Nhập mã voucher"
                  aria-label="Nhập mã voucher"
                />
                <button className="primary-button" type="button" onClick={() => handleApplyVoucher(voucherInput)} disabled={voucherApplying}>
                  {voucherApplying ? 'Đang kiểm tra...' : 'Áp dụng'}
                </button>
                <select
                  value={voucherInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setVoucherInput(nextValue);
                    if (nextValue) {
                      void handleApplyVoucher(nextValue);
                    } else {
                      setAppliedVoucher(null);
                      setVoucherMessage('');
                    }
                  }}
                >
                  <option value="">Chọn voucher có sẵn</option>
                  {voucherPool.map((voucher) => (
                    <option key={voucher.code} value={voucher.code}>{voucher.code} - {voucher.title}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className="span-2">
              Ghi chú
              <textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú cho đơn thuê" />
            </label>

            <div className="span-2 rental-cart-list">
              {cartItems.length > 0 ? cartItems.map((item) => (
                <article key={item.productId} className="rental-cart-item">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{formatMoney(item.rentalPricePerDay)}/ngày | Cọc {formatMoney(item.deposit)}</span>
                  </div>
                  <div className="rental-cart-actions">
                    <input
                      type="number"
                      min="1"
                      max={item.stock}
                      value={item.quantity}
                      onChange={(event) => handleChangeQuantity(item.productId, event.target.value)}
                    />
                    <button type="button" className="secondary-button" onClick={() => handleRemoveCartItem(item.productId)}>Xóa</button>
                  </div>
                </article>
              )) : <p>Chưa có board game trong đơn thuê.</p>}
            </div>

            <div className="span-2 rental-summary">
              <div><span>Số ngày thuê</span><strong>{rentalDays || 0} ngày</strong></div>
              <div><span>Tiền thuê</span><strong>{formatMoney(summary.subtotalRental)}</strong></div>
              <div><span>Tiền cọc</span><strong>{formatMoney(summary.subtotalDeposit)}</strong></div>
              <div><span>Mã voucher</span><strong>{appliedVoucher?.code || 'Không áp dụng'}</strong></div>
              <div><span>Giảm từ voucher</span><strong>-{formatMoney(summary.discount)}</strong></div>
              <div><span>Phí giao hàng</span><strong>{formatMoney(summary.shippingFee)}</strong></div>
              <div className="total"><span>Tổng tiền sau giảm</span><strong>{formatMoney(summary.total)}</strong></div>
              {voucherMessage ? <p className="rental-voucher-hint">{voucherMessage}</p> : null}
            </div>

            <div className="span-2 admin-form-actions">
              <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang gửi...' : 'Xác nhận đặt thuê'}</button>
            </div>
          </form>
        </aside>
      </div>

      <section className="card-surface rental-history-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lịch sử thuê</p>
            <h3>Theo dõi trạng thái đơn thuê</h3>
          </div>
        </div>

        <div className="rental-toolbar rental-history-toolbar">
          <input
            className="rental-search"
            type="search"
            placeholder="Tìm theo mã đơn thuê hoặc phương thức thanh toán"
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
          />
          <select className="rental-select" value={historyStatusFilter} onChange={(event) => setHistoryStatusFilter(event.target.value)}>
            {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="rental-history-layout">
          <div className="rental-table-wrap">
            <table className="rental-table">
              <thead>
                <tr>
                  <th>Mã đơn thuê</th>
                  <th>Ngày nhận</th>
                  <th>Ngày trả</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item.id} className={String(selectedHistory?.id) === String(item.id) ? 'is-selected' : ''}>
                    <td>{item.rentalNumber || `DT-${item.id}`}</td>
                    <td>{item.receiveDate || '-'}</td>
                    <td>{item.returnDate || '-'}</td>
                    <td>{formatMoney(item.totalAmount || 0)}</td>
                    <td><span className="status-pill">{item.status || 'Chờ xác nhận'}</span></td>
                    <td><button type="button" className="secondary-button" onClick={() => setSelectedHistoryId(String(item.id))}>Xem chi tiết</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="rental-detail-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Chi tiết đơn thuê</p>
                <h3>{selectedHistory?.rentalNumber || 'Chưa có đơn thuê'}</h3>
              </div>
            </div>

            {selectedHistory ? (
              <>
                <div className="rental-detail-grid">
                  <div><span>Ngày nhận</span><strong>{selectedHistory.receiveDate || '-'}</strong></div>
                  <div><span>Ngày trả</span><strong>{selectedHistory.returnDate || '-'}</strong></div>
                  <div><span>Thanh toán</span><strong>{selectedHistory.paymentMethod || '-'}</strong></div>
                  <div><span>Trạng thái thanh toán</span><strong>{selectedHistory.paymentStatus || '-'}</strong></div>
                  <div><span>Đơn vị vận chuyển</span><strong>{selectedHistory.shippingUnit || '-'}</strong></div>
                  <div><span>Voucher</span><strong>{selectedHistory.voucherCode || 'Không áp dụng'}</strong></div>
                </div>

                <div className="rental-detail-section">
                  <h4>Sản phẩm thuê</h4>
                  <div className="rental-item-list">
                    {(selectedHistory.items || []).map((item) => (
                      <article key={item.id || item.productId} className="rental-item-row">
                        <strong>{item.name}</strong>
                        <span>Số lượng: {item.quantity}</span>
                        <span>Giá thuê/ngày: {formatMoney(item.rentalPricePerDay)}</span>
                        <span>Tiền cọc: {formatMoney(item.depositPerItem || item.deposit || 0)}</span>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            ) : <p>Không có dữ liệu lịch sử thuê.</p>}
          </aside>
        </div>
      </section>

      {isQrModalOpen ? (
        <div className="rental-qr-overlay" role="presentation">
          <section className="card-surface rental-qr-modal" role="dialog" aria-modal="true" aria-label="Xác nhận thanh toán QR">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Xác nhận thanh toán</p>
                <h3>Quét QR {pendingPaymentLabel}</h3>
              </div>
            </div>

            <img className="rental-qr-image" src={pendingQrImage} alt={`QR ${pendingPaymentLabel}`} />
            <p>Vui lòng quét mã QR để hoàn tất thanh toán. Hệ thống sẽ tự quay lại trang xác nhận sau {qrCountdown}s.</p>

            <div className="admin-form-actions rental-qr-actions">
              <button className="primary-button" type="button" onClick={handleConfirmQrPayment} disabled={isSubmitting}>
                {isSubmitting ? 'Đang xác nhận...' : 'Đã thanh toán xong'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setIsQrModalOpen(false);
                  setPendingPayload(null);
                  setPendingQrImage('');
                  setPendingPaymentLabel('');
                }}
                disabled={isSubmitting}
              >
                Hủy
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Rental;
