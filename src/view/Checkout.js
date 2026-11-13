import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProductsData, useRentalOptionsData, useVoucherCatalog, validateVoucher } from './useBoardgameApi';
import { clearCart, useCartItemsState } from './cartStorage';
import { getAuthUser, isAuthenticated } from './auth';
import { applyVoucher, normalizeVoucherItem, resolveVoucherErrorMessage } from './voucherUtils';
import '../css/Checkout.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ';
}

function Checkout() {
  const navigate = useNavigate();
  const products = useProductsData();
  const authState = getAuthUser();
  const authUser = authState?.user;
  const userId = authUser?.id || authUser?.userId || null;
  const rentalOptions = useRentalOptionsData(userId);
  const voucherCatalog = useVoucherCatalog(userId);
  const cartItems = useCartItemsState();
  const [formData, setFormData] = useState({
    fullName: authUser?.displayName || authUser?.fullName || authUser?.username || '',
    phone: authUser?.phone || '',
    email: authUser?.email || '',
    address: '',
    note: '',
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherApplying, setVoucherApplying] = useState(false);
  const [voucherMessage, setVoucherMessage] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [addressMode, setAddressMode] = useState('saved');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('');
  const [selectedShippingUnitId, setSelectedShippingUnitId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(45);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [pendingQrImage, setPendingQrImage] = useState('');
  const [pendingPaymentLabel, setPendingPaymentLabel] = useState('');

  useEffect(() => {
    document.title = 'Thanh toán | Board Game VN';
  }, []);

  useEffect(() => {
    if (rentalOptions.addresses.length > 0) {
      const defaultAddress = rentalOptions.addresses.find((item) => item.isDefault) || rentalOptions.addresses[0];
      setSelectedAddressId((current) => current || String(defaultAddress.id));
      setAddressMode('saved');
    } else {
      setAddressMode('new');
    }

    if (rentalOptions.paymentMethods.length > 0) {
      setSelectedPaymentMethodId((current) => current || String(rentalOptions.paymentMethods[0].id));
    }

    if (rentalOptions.shippingUnits.length > 0) {
      setSelectedShippingUnitId((current) => current || String(rentalOptions.shippingUnits[0].id));
    }
  }, [rentalOptions.addresses, rentalOptions.paymentMethods, rentalOptions.shippingUnits]);

  const selectedAddress = useMemo(
    () => rentalOptions.addresses.find((item) => String(item.id) === String(selectedAddressId)) || null,
    [rentalOptions.addresses, selectedAddressId]
  );

  const selectedPaymentMethod = useMemo(
    () => rentalOptions.paymentMethods.find((item) => String(item.id) === String(selectedPaymentMethodId)) || null,
    [rentalOptions.paymentMethods, selectedPaymentMethodId]
  );

  const selectedShippingUnit = useMemo(
    () => rentalOptions.shippingUnits.find((item) => String(item.id) === String(selectedShippingUnitId)) || null,
    [rentalOptions.shippingUnits, selectedShippingUnitId]
  );

  useEffect(() => {
    if (addressMode !== 'saved' || !selectedAddress) {
      return;
    }

    setFormData((current) => ({
      ...current,
      fullName: selectedAddress.recipientName || current.fullName,
      phone: selectedAddress.phone || current.phone,
      address: selectedAddress.addressLine || current.address,
    }));
  }, [addressMode, selectedAddress]);

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

  const checkoutItems = useMemo(() => (
    cartItems
      .map((cartItem) => {
        const product = products.find((item) => item.id === cartItem.productId);
        if (!product) {
          return null;
        }

        return {
          ...product,
          quantity: cartItem.quantity,
          subtotal: product.price * cartItem.quantity,
        };
      })
      .filter(Boolean)
  ), [cartItems, products]);

  const subtotal = checkoutItems.reduce((total, item) => total + item.subtotal, 0);
  const shippingFee = checkoutItems.length > 0 ? Number(selectedShippingUnit?.fee || 0) : 0;

  const voucherPool = useMemo(() => {
    const merged = [
      ...(voucherCatalog.all || []),
      ...(rentalOptions.vouchers || []),
    ].map(normalizeVoucherItem).filter((voucher) => voucher.code);

    const voucherMap = new Map();
    merged.forEach((voucher) => {
      const current = voucherMap.get(voucher.code);
      voucherMap.set(voucher.code, current ? { ...voucher, ...current } : voucher);
    });

    return [...voucherMap.values()];
  }, [rentalOptions.vouchers, voucherCatalog.all]);

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
          subtotal,
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

        const currentDiscount = applyVoucher(subtotal, result.voucher || appliedVoucher);
        setVoucherMessage(`Đã áp dụng voucher ${result.voucher?.code || appliedVoucher.code}, giảm ${formatMoney(currentDiscount)}.`);
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
  }, [appliedVoucher, subtotal, userId]);

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
        subtotal,
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
      const discount = applyVoucher(subtotal, nextVoucher);
      setVoucherMessage(`Đã áp dụng voucher ${nextVoucher?.code || code}, giảm ${formatMoney(discount)}.`);
    } catch (error) {
      setAppliedVoucher(null);
      setVoucherInput(code);
      setVoucherMessage(resolveVoucherErrorMessage(error.message || 'Không có mã voucher này'));
    } finally {
      setVoucherApplying(false);
    }
  }

  const voucherDiscount = applyVoucher(subtotal, appliedVoucher);
  const finalTotal = subtotal + shippingFee - voucherDiscount;

  const voucherHint = voucherMessage || '';

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function getVoucherOptionLabel(voucher) {
    const discountLabel = Number(voucher.discountType || 2) === 1
      ? `Giảm ${voucher.value}%`
      : `Giảm ${formatMoney(voucher.value)}`;
    const minAmountLabel = `Đơn từ ${formatMoney(voucher.minAmount || 0)}`;
    const expiryLabel = voucher.endDate ? `Hết hạn ${String(voucher.endDate).slice(0, 10)}` : 'Không giới hạn';
    return `${voucher.title} | ${voucher.code} | ${discountLabel} | ${minAmountLabel} | ${expiryLabel}`;
  }

  async function submitOrder(payload) {
    const response = await fetch(`${apiBase}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.message || 'Không thể tạo đơn hàng.');
    }

    clearCart();
    setStatusMessage('Đơn hàng đã được tạo và chuyển sang trạng thái chờ xác nhận.');
    setTimeout(() => navigate('/orders'), 900);
    return result;
  }

  async function handleConfirmQrPayment() {
    if (!pendingPayload) {
      return;
    }

    setIsSubmitting(true);

    try {
      await submitOrder(pendingPayload);
      setIsQrModalOpen(false);
      setPendingPayload(null);
      setPendingQrImage('');
      setPendingPaymentLabel('');
      setStatusMessage('Thanh toán thành công. Đơn hàng đã được tạo.');
    } catch (error) {
      setStatusMessage(error.message || 'Không thể xác nhận thanh toán.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (checkoutItems.length === 0) {
      setStatusMessage('Giỏ hàng đang trống.');
      return;
    }

    if (!formData.fullName || !formData.address || !formData.phone) {
      setStatusMessage('Vui lòng nhập đầy đủ thông tin người nhận và địa chỉ giao hàng.');
      return;
    }

    if (!selectedPaymentMethodId || !selectedShippingUnitId) {
      setStatusMessage('Vui lòng chọn phương thức thanh toán và đơn vị vận chuyển.');
      return;
    }

    const payload = {
      userId,
      customerName: formData.fullName,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      note: formData.note,
      addressId: addressMode === 'saved' ? Number(selectedAddressId || 0) : null,
      shippingMethod: selectedShippingUnit?.name || 'Chưa chọn',
      shippingUnitId: Number(selectedShippingUnitId || 0),
      paymentMethod: selectedPaymentMethod?.name || 'COD',
      paymentMethodId: Number(selectedPaymentMethodId || 0),
      items: checkoutItems.map((item) => ({
        id: item.id,
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      subtotal,
      shippingFee,
      voucherCode: appliedVoucher?.code || null,
      voucherDiscount,
      total: finalTotal,
    };

    try {
      setIsSubmitting(true);
      const paymentName = normalizeText(selectedPaymentMethod?.name || '');
      const compactPaymentName = paymentName.replace(/\s+/g, '');
      const isMomoPayment = compactPaymentName.includes('momo');
      const isVnpayPayment = compactPaymentName.includes('vnpay');

      if (isMomoPayment || isVnpayPayment) {
        setPendingPayload(payload);
        setPendingQrImage(isMomoPayment ? '/image/MoMo.jpg' : '/image/MB.jpg');
        setPendingPaymentLabel(selectedPaymentMethod?.name || 'Thanh toán QR');
        setIsQrModalOpen(true);
        setStatusMessage('Đã mở mã QR, vui lòng hoàn tất thanh toán để tạo đơn hàng.');
      } else {
        await submitOrder(payload);
      }

    } catch (error) {
      setStatusMessage(error.message || 'Không thể tạo đơn hàng.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="card-surface checkout-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Thanh toán</p>
          <h2>Điền thông tin giao hàng</h2>
        </div>
        <Link className="secondary-button" to="/cart">Quay lại giỏ hàng</Link>
      </div>

      <form className="checkout-layout" onSubmit={handleSubmit}>
        <div className="checkout-form card-surface">
          <h3>Thông tin người nhận</h3>

          {isAuthenticated() && rentalOptions.addresses.length > 0 ? (
            <div className="choice-row">
              <label><input type="radio" name="addressMode" value="saved" checked={addressMode === 'saved'} onChange={() => setAddressMode('saved')} /> Chọn địa chỉ đã lưu</label>
              <label><input type="radio" name="addressMode" value="new" checked={addressMode === 'new'} onChange={() => setAddressMode('new')} /> Nhập địa chỉ mới</label>
            </div>
          ) : null}

          {addressMode === 'saved' && rentalOptions.addresses.length > 0 ? (
            <div className="checkout-saved-address-card">
              <label>
                Danh sách địa chỉ giao hàng đã lưu
                <select value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>
                  {rentalOptions.addresses.map((address) => (
                    <option key={address.id} value={address.id}>{address.recipientName} - {address.phone || 'Chưa có số điện thoại'}</option>
                  ))}
                </select>
              </label>

              {selectedAddress ? (
                <div className="checkout-address-preview">
                  <strong>{selectedAddress.recipientName}</strong>
                  <span>{selectedAddress.phone || 'Chưa có số điện thoại'}</span>
                  <span>{selectedAddress.addressLine}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="checkout-grid">
            <label>
              Họ và tên
              <input name="fullName" value={formData.fullName} onChange={handleFieldChange} />
            </label>
            <label>
              Số điện thoại
              <input name="phone" value={formData.phone} onChange={handleFieldChange} />
            </label>
            <label className="full-span">
              Địa chỉ giao hàng
              <input name="address" value={formData.address} onChange={handleFieldChange} />
            </label>
            <label className="full-span">
              Email
              <input name="email" type="email" value={formData.email} onChange={handleFieldChange} />
            </label>
            <label className="full-span">
              Ghi chú đơn hàng
              <textarea name="note" rows="3" value={formData.note} onChange={handleFieldChange} placeholder="Ví dụ: giao giờ hành chính, gọi trước khi giao" />
            </label>
          </div>

          <h3>Voucher</h3>
          <div className="checkout-voucher-row">
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
                <option key={`${voucher.scope}-${voucher.code}`} value={voucher.code}>{getVoucherOptionLabel(voucher)}</option>
              ))}
            </select>
          </div>
          {voucherHint ? <p className="checkout-status">{voucherHint}</p> : null}

          <h3>Phương thức thanh toán</h3>
          <label>
            Danh sách phương thức thanh toán
            <select value={selectedPaymentMethodId} onChange={(event) => setSelectedPaymentMethodId(event.target.value)}>
              {rentalOptions.paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>{method.name}</option>
              ))}
            </select>
          </label>

          <h3>Đơn vị vận chuyển</h3>
          <label>
            Danh sách đơn vị vận chuyển
            <select value={selectedShippingUnitId} onChange={(event) => setSelectedShippingUnitId(event.target.value)}>
              {rentalOptions.shippingUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name} - {formatMoney(unit.fee || 0)}</option>
              ))}
            </select>
          </label>

          <button className="primary-button full-width" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang xử lý...' : 'Đặt hàng'}</button>
          {statusMessage ? <p className="checkout-status">{statusMessage}</p> : null}
        </div>

        <aside className="checkout-summary card-surface">
          <h3>Thông tin đơn hàng</h3>
          <div className="summary-list">
            {checkoutItems.map((item) => (
              <div key={item.id} className="summary-item">
                <span>{item.name} x {item.quantity}</span>
                <strong>{formatMoney(item.subtotal)}</strong>
              </div>
            ))}
          </div>

          <div className="summary-row"><span>Tổng tiền trước giảm</span><strong>{formatMoney(subtotal)}</strong></div>
          <div className="summary-row"><span>Mã voucher</span><strong>{appliedVoucher?.code || 'Không áp dụng'}</strong></div>
          <div className="summary-row"><span>Giảm từ voucher</span><strong>-{formatMoney(voucherDiscount)}</strong></div>
          <div className="summary-row"><span>Phí vận chuyển</span><strong>{formatMoney(shippingFee)}</strong></div>
          <div className="summary-row total"><span>Tổng tiền sau giảm</span><strong>{formatMoney(finalTotal)}</strong></div>
          <p className="summary-note">Sau khi xác nhận, đơn hàng sẽ được lưu với trạng thái Chờ xác nhận để nhân viên xử lý.</p>
        </aside>
      </form>

      {isQrModalOpen ? (
        <div className="checkout-qr-overlay" role="presentation">
          <section className="card-surface checkout-qr-modal" role="dialog" aria-modal="true" aria-label="Xác nhận thanh toán QR">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Xác nhận thanh toán</p>
                <h3>Quét QR {pendingPaymentLabel}</h3>
              </div>
            </div>

            <img className="checkout-qr-image" src={pendingQrImage} alt={`QR ${pendingPaymentLabel}`} />
            <p>Vui lòng quét mã QR để hoàn tất thanh toán. Hệ thống sẽ tự quay lại sau {qrCountdown}s.</p>

            <div className="admin-form-actions checkout-qr-actions">
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

export default Checkout;
