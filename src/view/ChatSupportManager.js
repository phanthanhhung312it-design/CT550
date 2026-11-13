import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthToken, getAuthUser, isAuthenticated } from './auth';
import ProductArtwork from './ProductArtwork';
import '../css/ChatSupport.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function formatDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('vi-VN');
}

function getMessageSortValue(message) {
  const candidate = message?.created_at || message?.createdAt || message?.updated_at || message?.updatedAt || 0;
  const parsedDate = new Date(candidate);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  const numericId = Number(message?.tn_ma ?? message?.id ?? message?.ph_ma ?? NaN);
  if (Number.isFinite(numericId)) {
    return numericId;
  }

  const parsedNumber = Number(candidate);
  return Number.isFinite(parsedNumber) ? parsedNumber : 0;
}

function repairVietnameseText(value) {
  let text = String(value || '').replace(/\uFFFD/g, '?');
  const replacements = [
    [/Lu\?t choi Catan/gi, 'Luật chơi Catan'],
    [/Lu\?t ch\?i Catan/gi, 'Luật chơi Catan'],
    [/lu\?t choi Catan/gi, 'luật chơi Catan'],
    [/lu\?t ch\?i Catan/gi, 'luật chơi Catan'],
    [/Don h\?ng/gi, 'Đơn hàng'],
    [/don h\?ng/gi, 'đơn hàng'],
    [/dang \? d\?u\?/gi, 'đang ở đâu?'],
    [/dang \? d\?u/gi, 'đang ở đâu'],
    [/d\?u\?/gi, 'đâu?'],
    [/d\?u/gi, 'đâu'],
    [/c\?a/g, 'của'],
    [/m\?nh/g, 'mình'],
    [/kh\?ng/g, 'không'],
    [/h\?ng/g, 'hàng'],
    [/dang/g, 'đang'],
    [/d\?ng/g, 'dùng'],
    [/du\?c/g, 'được'],
    [/x\?c nh\?n/g, 'xác nhận'],
    [/thanh to\?n/g, 'thanh toán'],
    [/x\? l\?/g, 'xử lý'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return text;
}

function getCustomerName(user) {
  return user?.displayName || user?.fullName || user?.username || user?.email || 'Khách hàng';
}

function getUserId(user) {
  return user?.id || user?.userId || user?.sub || null;
}

function getSenderLabel(sender) {
  if (sender === 'bot') {
    return 'Chatbot AI';
  }

  if (sender === 'employee') {
    return 'Nhân viên';
  }

  return 'Khách hàng';
}

function getStatusLabel(session) {
  const status = normalizeText(session?.status || '');

  if (status.includes('closed') || status.includes('ket thuc')) {
    return 'Đã kết thúc';
  }

  if (status.includes('unread') || status.includes('chua doc')) {
    return 'Chưa đọc';
  }

  if (Number(session?.ph_da_chuyenchonv) === 1 || status.includes('active') || status.includes('dang hoat dong')) {
    return 'Đang hoạt động';
  }

  return 'Đang hoạt động';
}

function getStatusClass(session) {
  const label = getStatusLabel(session);
  if (label === 'Đã kết thúc') {
    return 'status-closed';
  }

  if (label === 'Chưa đọc') {
    return 'status-unread';
  }

  return 'status-active';
}

function formatSenderName(message) {
  return getSenderLabel(message.sender);
}

function getBubbleRole(message) {
  if (message.sender === 'bot') {
    return 'bot';
  }

  if (message.sender === 'employee') {
    return 'employee';
  }

  return 'customer';
}

function toSessionId(session) {
  return String(session?.session_token || session?.sessionId || session?.ph_ma || '');
}

function isHumanAssignedSession(session) {
  return Number(session?.ph_da_chuyenchonv) === 1 || Number(session?.nv_ma || 0) > 0 || Boolean(session?.isHumanAssigned);
}

function ChatSupportManager() {
  const authState = getAuthUser();
  const authUser = authState?.user;
  const token = getAuthToken();
  const authRole = String(authUser?.role || '').toLowerCase();
  const canManage = authRole === 'admin' || authRole === 'employee';

  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);

  const fetchJson = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    if (response.status === 204) {
      return null;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'Không thể tải dữ liệu chat hỗ trợ.');
    }

    return payload;
  }, [token]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      return;
    }

    try {
      setErrorMessage('');
      if (!silent || !hasLoadedOnceRef.current) {
        setLoading(true);
      }
      const [sessionRows, messageRows, userRows] = await Promise.all([
        fetchJson('/admin/collections/chatbot_phienhoithoai', { method: 'GET' }).catch(() => []),
        fetchJson('/admin/collections/chatbot_tinnhan', { method: 'GET' }).catch(() => []),
        fetchJson('/admin/users', { method: 'GET' }).catch(() => []),
      ]);

      setSessions(Array.isArray(sessionRows) ? sessionRows : []);
      setMessages(Array.isArray(messageRows) ? messageRows : []);
      setUsers(Array.isArray(userRows) ? userRows : []);
      hasLoadedOnceRef.current = true;
    } catch (error) {
      setErrorMessage(error.message || 'Không thể tải dữ liệu chat hỗ trợ.');
    } finally {
      if (!silent || !hasLoadedOnceRef.current) {
        setLoading(false);
      }
    }
  }, [fetchJson, token]);

  useEffect(() => {
    if (canManage) {
      loadData({ silent: false });
    }
  }, [canManage, loadData]);

  useEffect(() => {
    if (!canManage) {
      return undefined;
    }

    const params = new URLSearchParams();
    if (selectedSessionId) {
      params.set('sessionId', selectedSessionId);
    }

    const stream = new EventSource(`${API_BASE}/admin/chatbot/stream?${params.toString()}`);
    const refresh = () => {
      loadData({ silent: true });
    };

    stream.addEventListener('chat-event', refresh);
    stream.onerror = () => {
      stream.close();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stream.removeEventListener('chat-event', refresh);
      stream.close();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [canManage, loadData, selectedSessionId]);

  const userMap = useMemo(() => new Map(users.map((user) => [String(user.id || user.userId), user])), [users]);

  const messageGroups = useMemo(() => {
    const grouped = new Map();
    messages.forEach((message) => {
      const key = String(message.ph_ma || message.sessionId || message.session_token || '');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(message);
    });

    return grouped;
  }, [messages]);

  const sessionRows = useMemo(() => {
    return sessions
      .filter((session) => Boolean(session?.session_token))
      .map((session) => {
      const sessionId = toSessionId(session);
      const sessionMessages = [...(messageGroups.get(String(session.ph_ma)) || [])]
        .sort((left, right) => getMessageSortValue(left) - getMessageSortValue(right));
      const lastMessage = sessionMessages[sessionMessages.length - 1] || null;
      const customer = userMap.get(String(session.user_ma || session.userId)) || null;

      return {
        id: sessionId,
        sessionId,
        rawSession: session,
        customerId: session.user_ma || session.userId || null,
        customerName: getCustomerName(customer) || `Khách hàng #${session.user_ma || '-'}`,
        avatar: customer?.avatar || customer?.photo || '',
        lastMessage: repairVietnameseText(lastMessage?.tn_noidung || lastMessage?.content || '-'),
        lastMessageTime: lastMessage?.created_at || lastMessage?.createdAt || session.updated_at || session.ph_batdau,
        statusLabel: getStatusLabel(session),
        isAssignedToEmployee: isHumanAssignedSession(session),
        updatedAt: session.updated_at || session.ph_batdau || null,
        unread: Boolean(lastMessage && (Number(lastMessage.tn_nguoigui) === 1 || lastMessage.sender === 'user') && Number(session.ph_da_chuyenchonv) !== 0),
      };
    }).sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
  }, [messageGroups, sessions, userMap]);

  useEffect(() => {
    if (!selectedSessionId && sessionRows.length > 0) {
      setSelectedSessionId(sessionRows[0].id);
    }
  }, [selectedSessionId, sessionRows]);

  const filteredSessions = useMemo(() => {
    const query = normalizeText(searchText);
    return sessionRows.filter((session) => {
      if (!query) {
        return true;
      }

      return normalizeText([session.customerName, session.sessionId, session.lastMessage].join(' ')).includes(query);
    });
  }, [searchText, sessionRows]);

  const selectedSession = useMemo(() => {
    if (!filteredSessions.length) {
      return null;
    }

    return filteredSessions.find((session) => String(session.id) === String(selectedSessionId)) || filteredSessions[0];
  }, [filteredSessions, selectedSessionId]);

  const selectedThread = useMemo(() => {
    if (!selectedSession) {
      return [];
    }

    return [...(messageGroups.get(String(selectedSession.rawSession.ph_ma)) || [])]
      .sort((left, right) => getMessageSortValue(left) - getMessageSortValue(right))
      .map((message) => ({
        id: message.tn_ma || message.id,
        sender: Number(message.tn_nguoigui) === 0 || message.sender === 'bot'
          ? 'bot'
          : Number(message.tn_nguoigui) === 2 || message.sender === 'employee'
            ? 'employee'
            : 'customer',
        text: repairVietnameseText(message.tn_noidung || message.content || ''),
        createdAt: message.created_at || message.createdAt || null,
        resourceLinks: Array.isArray(message.resourceLinks) ? message.resourceLinks : [],
        recommendations: Array.isArray(message.recommendations) ? message.recommendations : [],
        orderInfo: message.orderInfo || null,
        statusLabel: Number(message.tn_nguoigui) === 1 || message.sender === 'user' ? 'Đã gửi' : 'Đã xem',
      }));
  }, [messageGroups, selectedSession]);

  const selectedUserId = getUserId(authUser);

  async function handleSendMessage(event) {
    event.preventDefault();
    const cleanMessage = String(draftMessage || '').trim();
    if (!cleanMessage || !selectedSession) {
      return;
    }

    try {
      setErrorMessage('');
      const now = new Date().toISOString();

      await fetchJson('/admin/collections/chatbot_tinnhan', {
        method: 'POST',
        body: JSON.stringify({
          ph_ma: selectedSession.rawSession.ph_ma,
          tn_nguoigui: 2,
          tn_noidung: cleanMessage,
          created_at: now,
          updated_at: now,
        }),
      });

      await fetchJson(`/admin/collections/chatbot_phienhoithoai/${selectedSession.rawSession._id || selectedSession.rawSession.id || selectedSession.rawSession.ph_ma}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...selectedSession.rawSession,
          ph_da_chuyenchonv: 1,
          nv_ma: selectedUserId,
          status: 'active',
          updated_at: now,
        }),
      }).catch(() => null);

      setDraftMessage('');
      setStatusMessage('Đã gửi tin nhắn hỗ trợ.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể gửi tin nhắn hỗ trợ.');
    }
  }

  async function handleAssignToEmployee() {
    if (!selectedSession) {
      return;
    }

    try {
      setErrorMessage('');
      const now = new Date().toISOString();
      await fetchJson(`/admin/collections/chatbot_phienhoithoai/${selectedSession.rawSession._id || selectedSession.rawSession.id || selectedSession.rawSession.ph_ma}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...selectedSession.rawSession,
          ph_da_chuyenchonv: 1,
          nv_ma: selectedUserId,
          status: 'active',
          updated_at: now,
        }),
      });
      setStatusMessage('Đã chuyển hội thoại cho nhân viên.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể chuyển hội thoại cho nhân viên.');
    }
  }

  async function handleCloseConversation() {
    if (!selectedSession) {
      return;
    }

    try {
      setErrorMessage('');
      const now = new Date().toISOString();
      await fetchJson(`/admin/collections/chatbot_phienhoithoai/${selectedSession.rawSession._id || selectedSession.rawSession.id || selectedSession.rawSession.ph_ma}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...selectedSession.rawSession,
          status: 'closed',
          updated_at: now,
        }),
      });
      setStatusMessage('Đã kết thúc hội thoại.');
      await loadData();
    } catch (error) {
      setErrorMessage(error.message || 'Không thể kết thúc hội thoại.');
    }
  }

  async function handleExportTrainingData() {
    try {
      setErrorMessage('');
      const payload = await fetchJson('/admin/chatbot/training-dataset?limit=1000', { method: 'GET' });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chatbot-training-dataset-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Đã xuất ${payload?.count || 0} mẫu dữ liệu huấn luyện AI.`);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể xuất dữ liệu huấn luyện AI.');
    }
  }

  if (!isAuthenticated()) {
    return null;
  }

  if (!canManage) {
    return <div className="chat-support-locked">Bạn không có quyền truy cập chat hỗ trợ.</div>;
  }

  return (
    <section className="chat-support-page">
      <header className="chat-support-header card-surface">
        <div>
          <p className="eyebrow">Chat hỗ trợ khách hàng</p>
          <h2>Messenger hỗ trợ khách hàng</h2>
          <p>Quản lý hội thoại giữa khách hàng, Chatbot AI và nhân viên trong cùng một màn hình.</p>
        </div>
        <div className="chat-support-header-actions">
          <button type="button" className="secondary-button" onClick={loadData}>Làm mới</button>
          <button type="button" className="secondary-button" onClick={handleExportTrainingData}>Xuất dữ liệu huấn luyện AI</button>
          <button type="button" className="primary-button" onClick={handleAssignToEmployee} disabled={!selectedSession}>Nhân viên tiếp nhận</button>
        </div>
      </header>

      {errorMessage ? <p className="chat-support-message error">{errorMessage}</p> : null}
      {statusMessage ? <p className="chat-support-message success">{statusMessage}</p> : null}

      <div className="chat-support-layout">
        <aside className="chat-support-sidebar card-surface">
          <div className="chat-support-search-wrap">
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Tìm khách hàng hoặc mã phiên"
            />
          </div>

          <div className="chat-session-list">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`chat-session-item ${String(selectedSession?.id) === String(session.id) ? 'active' : ''}`}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <div className="chat-session-avatar">{String(session.customerName || 'K').slice(0, 1).toUpperCase()}</div>
                <div className="chat-session-body">
                  <div className="chat-session-topline">
                    <strong>{session.customerName}</strong>
                    <span>{formatDateTime(session.lastMessageTime)}</span>
                  </div>
                  <p>{session.lastMessage}</p>
                  <div className="chat-session-meta">
                    <span className={`chat-session-status ${getStatusClass(session)}`}>{session.statusLabel}</span>
                    {session.unread ? <span className="chat-session-unread">Chưa đọc</span> : null}
                    <span className="chat-session-code">{session.sessionId}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="chat-support-main card-surface">
          {loading ? <p>Đang tải hội thoại...</p> : null}
          {!loading && selectedSession ? (
            <>
              <header className="chat-thread-header">
                <div>
                  <h3>{selectedSession.customerName}</h3>
                  <p>Mã phiên: {selectedSession.sessionId} · {selectedSession.statusLabel}</p>
                </div>
                <div className="chat-thread-actions">
                  <button type="button" className="secondary-button" onClick={handleAssignToEmployee}>Nhân viên tiếp nhận</button>
                  <button type="button" className="danger-button" onClick={handleCloseConversation}>Kết thúc</button>
                </div>
              </header>

              <div className="chat-thread-body" aria-live="polite">
                {selectedThread.map((message) => (
                  <article key={message.id} className={`chat-bubble ${getBubbleRole(message)}`}>
                    <div className="chat-bubble-meta">
                      <strong>{formatSenderName(message)}</strong>
                      <span>{formatDateTime(message.createdAt)}</span>
                      <span>{message.statusLabel}</span>
                    </div>
                    <p>{message.text}</p>

                    {message.sender === 'bot' && Array.isArray(message.resourceLinks) && message.resourceLinks.length > 0 ? (
                      <div className="chat-support-resource-links">
                        {message.resourceLinks.map((link) => (
                          /^https?:\/\//i.test(String(link.path || '')) ? (
                            <a
                              key={`${message.id}-${link.path}-${link.label}`}
                              className="chat-support-resource-link"
                              href={link.path}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <strong>{link.label}</strong>
                              {link.description ? <span>{link.description}</span> : null}
                            </a>
                          ) : (
                            <Link key={`${message.id}-${link.path}-${link.label}`} className="chat-support-resource-link" to={link.path}>
                              <strong>{link.label}</strong>
                              {link.description ? <span>{link.description}</span> : null}
                            </Link>
                          )
                        ))}
                      </div>
                    ) : null}

                    {message.sender === 'bot' && message.orderInfo ? (
                      <div className="chat-support-order-card">
                        <strong>{message.orderInfo.orderNumber || 'Đơn hàng'}</strong>
                        <span>Trạng thái: {message.orderInfo.status || 'Chưa xác định'}</span>
                        {message.orderInfo.paymentMethod ? <span>Thanh toán: {message.orderInfo.paymentMethod}</span> : null}
                        {message.orderInfo.totalAmount ? <span>Tổng tiền: {Number(message.orderInfo.totalAmount || 0).toLocaleString('vi-VN')} đ</span> : null}
                        {message.orderInfo.update ? <p>{message.orderInfo.update}</p> : null}
                        {message.orderInfo.eta ? <p>{message.orderInfo.eta}</p> : null}
                      </div>
                    ) : null}

                    {message.sender === 'bot' && Array.isArray(message.recommendations) && message.recommendations.length > 0 ? (
                      <div className="chat-support-recommendations">
                        {message.recommendations.map((product) => (
                          <div key={product.id} className="chat-support-product-card">
                            <ProductArtwork product={product} className="chat-support-product-image" imageClassName="chat-support-product-image-media" />
                            <div className="chat-support-product-body">
                              <strong>{product.name}</strong>
                              <span>{product.category}</span>
                              <span>{Number(product.price || 0).toLocaleString('vi-VN')} đ</span>
                              <span>{Number(product.stock || 0) > 0 ? `Còn ${Number(product.stock)} sản phẩm` : 'Hết hàng'}</span>
                              <span>Thuê từ {Number(product.rentalPrice || 0).toLocaleString('vi-VN')} đ/ngày</span>
                              <span>{product.players} | {product.age} | {product.playTime}</span>
                              <span>Đánh giá {Number(product.rating || 0).toFixed(1)}/5 ({Number(product.reviews || 0)} lượt đánh giá)</span>
                              <div className="chat-support-product-actions">
                                <Link className="secondary-button" to={`/product/${product.id}`}>Xem chi tiết</Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
                {selectedThread.length === 0 ? <p>Chưa có tin nhắn trong phiên này.</p> : null}
              </div>

              <form className="chat-composer" onSubmit={handleSendMessage}>
                <textarea
                  rows="4"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="Nhập nội dung trả lời cho khách hàng..."
                />
                <div className="chat-composer-actions">
                  <button type="button" className="secondary-button" disabled>Gửi hình ảnh / tệp</button>
                  <button className="primary-button" type="submit">Gửi tin nhắn</button>
                </div>
              </form>
            </>
          ) : null}
          {!loading && !selectedSession ? <p>Chưa có hội thoại nào để hiển thị.</p> : null}
        </main>
      </div>
    </section>
  );
}

export default ChatSupportManager;