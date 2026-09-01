import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { getAuthUser, isAuthenticated } from './auth';
import ProductArtwork from './ProductArtwork';
import '../css/Support.css';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';
const SUPPORT_SESSION_KEY = 'boardgamevn-support-session';

function formatDateTime(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('vi-VN');
}

function repairVietnameseText(value) {
  return String(value || '').replace(/\uFFFD/g, '?');
}

function getStoredSupportSessionId() {
  return window.localStorage.getItem(SUPPORT_SESSION_KEY) || '';
}

function getSessionIdFromUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('sessionId') || '';
}

function getDisplayRole(message) {
  if (message.sender === 'bot') {
    return 'is-bot';
  }

  if (message.sender === 'employee') {
    return 'is-employee';
  }

  return 'is-user';
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

function buildFallbackSession(sessionId, messages = [], isHumanAssigned = false) {
  const lastMessage = messages[messages.length - 1] || null;

  return {
    sessionId,
    avatar: lastMessage?.sender === 'employee' ? '👩‍💼' : '💬',
    title: 'Phiên hỗ trợ',
    lastMessage: lastMessage?.text || 'Chưa có tin nhắn',
    lastMessageTime: lastMessage?.createdAt || Date.now(),
    statusLabel: isHumanAssigned ? 'Đang trao đổi với nhân viên' : 'Chatbot AI',
    isHumanAssigned,
  };
}

function buildSessionFromPayload(payload) {
  const messages = normalizeThreadMessages(payload?.messages);

  return buildFallbackSession(payload?.sessionId || '', messages, Boolean(payload?.isHumanAssigned));
}

function normalizeThreadMessages(items) {
  return (Array.isArray(items) ? items : [])
    .sort((left, right) => getMessageSortValue(left) - getMessageSortValue(right))
    .map((message) => ({
      ...message,
      text: repairVietnameseText(message.text),
    }));
}

function Support() {
  const authState = getAuthUser();
  const authUser = authState?.user;
  const userId = authUser?.id || authUser?.userId || null;
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const threadBottomRef = useRef(null);
  const threadRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastThreadSignatureRef = useRef('');
  const loadThreadInFlightRef = useRef(false);

  const fetchJson = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || 'Không thể tải dữ liệu hỗ trợ.');
      error.status = response.status;
      throw error;
    }

    return payload;
  }, []);

  const loadThread = useCallback(async (sessionId, options = {}) => {
    const { silent = false } = options;

    if (!sessionId || !userId) {
      setMessages([]);
      lastThreadSignatureRef.current = '';
      return [];
    }

    if (loadThreadInFlightRef.current) {
      return [];
    }

    loadThreadInFlightRef.current = true;
    if (!silent) {
      setLoadingThread(true);
    }

    try {
      const payload = await fetchJson(`/chatbot/session?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}&humanOnly=1`);
      const nextMessages = normalizeThreadMessages(payload.messages);
      const nextSignature = JSON.stringify(nextMessages.map((message) => [
        message.id || message.tn_ma || '',
        message.sender || '',
        message.createdAt || message.created_at || '',
        message.text || '',
      ]));

      if (nextSignature !== lastThreadSignatureRef.current) {
        setMessages(nextMessages);
        lastThreadSignatureRef.current = nextSignature;
      }

      stickToBottomRef.current = true;
      return nextMessages;
    } catch (error) {
      setErrorMessage('');
      return [];
    } finally {
      loadThreadInFlightRef.current = false;
      if (!silent) {
        setLoadingThread(false);
      }
    }
  }, [fetchJson, userId]);

  const loadSessions = useCallback(async (options = {}) => {
    const { silent = false } = options;

    if (!userId) {
      setSessions([]);
      setLoadingSessions(false);
      return;
    }

    if (!silent) {
      setLoadingSessions(true);
    }

    try {
      const storedSessionId = getStoredSupportSessionId();
      const urlSessionId = getSessionIdFromUrl();
      const preferredSessionId = urlSessionId || storedSessionId;
      const query = new URLSearchParams({ userId: String(userId) });
      if (preferredSessionId) {
        query.set('sessionId', preferredSessionId);
      }

      const payload = await fetchJson(`/chatbot/sessions?${query.toString()}`);
      const nextSessions = Array.isArray(payload) ? payload : [];
      let resolvedSessions = nextSessions;

      if (nextSessions.length > 0) {
        const preferredSession = nextSessions.find((session) => String(session.sessionId) === String(preferredSessionId)) || nextSessions[0];
        setSelectedSessionId(preferredSession.sessionId);
        window.localStorage.setItem(SUPPORT_SESSION_KEY, preferredSession.sessionId);
      } else if (preferredSessionId) {
        const latestPayload = await fetchJson(`/chatbot/session?sessionId=${encodeURIComponent(preferredSessionId)}&userId=${encodeURIComponent(userId)}&humanOnly=1`);
        if (latestPayload?.sessionId) {
          const fallbackSession = buildSessionFromPayload(latestPayload);
          resolvedSessions = [fallbackSession];
          setSelectedSessionId(fallbackSession.sessionId);
          window.localStorage.setItem(SUPPORT_SESSION_KEY, fallbackSession.sessionId);
          const nextMessages = normalizeThreadMessages(latestPayload.messages);
          const nextSignature = JSON.stringify(nextMessages.map((message) => [
            message.id || message.tn_ma || '',
            message.sender || '',
            message.createdAt || message.created_at || '',
            message.text || '',
          ]));
          setMessages(nextMessages);
          lastThreadSignatureRef.current = nextSignature;
        }
      } else {
        const latestPayload = await fetchJson(`/chatbot/session?userId=${encodeURIComponent(userId)}&humanOnly=1`);
        if (latestPayload?.sessionId) {
          const fallbackSession = buildSessionFromPayload(latestPayload);
          resolvedSessions = [fallbackSession];
          setSelectedSessionId(fallbackSession.sessionId);
          window.localStorage.setItem(SUPPORT_SESSION_KEY, fallbackSession.sessionId);
          const nextMessages = normalizeThreadMessages(latestPayload.messages);
          const nextSignature = JSON.stringify(nextMessages.map((message) => [
            message.id || message.tn_ma || '',
            message.sender || '',
            message.createdAt || message.created_at || '',
            message.text || '',
          ]));
          setMessages(nextMessages);
          lastThreadSignatureRef.current = nextSignature;
        }
      }

      setSessions(resolvedSessions);
    } catch (error) {
      try {
        const latestPayload = await fetchJson(`/chatbot/session?userId=${encodeURIComponent(userId)}&humanOnly=1`);
        if (latestPayload?.sessionId) {
          const fallbackSession = buildSessionFromPayload(latestPayload);
          setSessions([fallbackSession]);
          setSelectedSessionId(fallbackSession.sessionId);
          window.localStorage.setItem(SUPPORT_SESSION_KEY, fallbackSession.sessionId);
          const nextMessages = normalizeThreadMessages(latestPayload.messages);
          const nextSignature = JSON.stringify(nextMessages.map((message) => [
            message.id || message.tn_ma || '',
            message.sender || '',
            message.createdAt || message.created_at || '',
            message.text || '',
          ]));
          setMessages(nextMessages);
          lastThreadSignatureRef.current = nextSignature;
          return;
        }
      } catch {
        // Fall through to the empty state below.
      }

      setSessions([]);
      setErrorMessage('');
    } finally {
      if (!silent) {
        setLoadingSessions(false);
      }
    }
  }, [fetchJson, userId]);

  useEffect(() => {
    if (isAuthenticated()) {
      loadSessions();
    }
  }, [loadSessions]);

  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0].sessionId);
    }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    loadThread(selectedSessionId);
  }, [loadThread, selectedSessionId]);

  useEffect(() => {
    if (!userId || !selectedSessionId) {
      return undefined;
    }

    const params = new URLSearchParams({ userId: String(userId) });
    params.set('sessionId', selectedSessionId);
    const stream = new EventSource(`${API_BASE}/chatbot/stream?${params.toString()}`);

    const handleChatEvent = () => {
      loadSessions({ silent: true });
      loadThread(selectedSessionId, { silent: true });
    };

    stream.addEventListener('chat-event', handleChatEvent);

    stream.onerror = () => {
      stream.close();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadSessions({ silent: true });
        loadThread(selectedSessionId, { silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stream.removeEventListener('chat-event', handleChatEvent);
      stream.close();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadSessions, loadThread, selectedSessionId, userId]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    threadBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const selectedSession = useMemo(
    () => sessions.find((session) => String(session.sessionId) === String(selectedSessionId)) || sessions[0] || null,
    [selectedSessionId, sessions]
  );

  async function startNewSession() {
    if (!userId) {
      return;
    }

    setErrorMessage('');
    setStatusMessage('');

    try {
      const payload = await fetchJson('/chatbot/support-session', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });

      const newSession = buildSessionFromPayload(payload);
      setSessions((current) => [newSession, ...current]);
      setSelectedSessionId(newSession.sessionId);
      window.localStorage.setItem(SUPPORT_SESSION_KEY, newSession.sessionId);
      setMessages([]);
      lastThreadSignatureRef.current = '';
      setStatusMessage('\u0110\u00e3 t\u1ea1o phi\u00ean h\u1ed9i tho\u1ea1i m\u1edbi v\u1edbi nh\u00e2n vi\u00ean h\u1ed7 tr\u1ee3.');
    } catch (error) {
      setErrorMessage(error.message || 'Kh\u00f4ng th\u1ec3 t\u1ea1o phi\u00ean h\u1ed9i tho\u1ea1i m\u1edbi.');
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const cleanMessage = String(draftMessage || '').trim();
    if (!cleanMessage || !userId) {
      return;
    }

    setStatusMessage('');
    setErrorMessage('');

    try {
      const payload = await fetchJson('/chatbot/message', {
        method: 'POST',
        body: JSON.stringify({ sessionId: selectedSessionId, userId, message: cleanMessage, humanOnly: true }),
      });

      if (payload.sessionId) {
        setSelectedSessionId(payload.sessionId);
        window.localStorage.setItem(SUPPORT_SESSION_KEY, payload.sessionId);
      }

      setDraftMessage('');
      setStatusMessage('Đã gửi tin nhắn hỗ trợ.');
      await loadSessions();
      await loadThread(payload.sessionId || selectedSessionId);
    } catch (error) {
      setErrorMessage(error.message || 'Không thể gửi tin nhắn.');
    }
  }

  function handleHistoryScroll(event) {
    const container = event.currentTarget;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceToBottom < 120;
  }

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <section className="support-page card-surface">
      <header className="support-header">
        <div>
          <p className="eyebrow">Chat hỗ trợ</p>
          <h2>Messenger hỗ trợ khách hàng</h2>
          <p>Trao đổi trực tiếp với nhân viên hỗ trợ.</p>
        </div>
        <button type="button" className="primary-button" onClick={startNewSession}>Phiên hội thoại mới</button>
      </header>

      {errorMessage ? <p className="support-alert error">{errorMessage}</p> : null}
      {statusMessage ? <p className="support-alert success">{statusMessage}</p> : null}

      <div className="support-messenger">
        <aside className="support-session-list">
          <div className="support-panel-title">
            <h3>Danh sách hội thoại</h3>
            <span>{loadingSessions ? 'Đang tải...' : `${sessions.length} phiên`}</span>
          </div>

          {sessions.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              className={`support-session-item ${String(selectedSessionId) === String(session.sessionId) ? 'active' : ''}`}
              onClick={() => {
                setSelectedSessionId(session.sessionId);
                window.localStorage.setItem(SUPPORT_SESSION_KEY, session.sessionId);
              }}
            >
              <div className="support-session-avatar">{session.avatar || '💬'}</div>
              <div className="support-session-body">
                <div className="support-session-topline">
                  <strong>{session.title}</strong>
                  <span>{formatDateTime(session.lastMessageTime)}</span>
                </div>
                <p>{repairVietnameseText(session.lastMessage || 'Chưa có tin nhắn')}</p>
                <div className="support-session-meta">
                  <span className="support-session-status">{session.statusLabel}</span>
                </div>
              </div>
            </button>
          ))}

          {!loadingSessions && sessions.length === 0 ? <p className="support-empty-state">Chưa có cuộc hội thoại nào.</p> : null}
        </aside>

        <main className="support-thread">
          <header className="support-thread-header">
            <div>
              <h3>{selectedSession ? selectedSession.title : 'Chưa chọn hội thoại'}</h3>
              <p>{selectedSession ? selectedSession.statusLabel : 'Chọn một cuộc trò chuyện để tiếp tục.'}</p>
            </div>
          </header>

          <div className="support-thread-body" onScroll={handleHistoryScroll} ref={threadRef}>
            {loadingThread && messages.length === 0 ? <p className="support-loading">Đang tải hội thoại...</p> : null}
            {messages.map((message) => (
              <article key={message.id} className={`support-message ${getDisplayRole(message)}`}>
                <div className="support-message-bubble">
                  <strong>{message.sender === 'employee' ? 'Nhân viên' : message.sender === 'bot' ? 'Chatbot AI' : 'Khách hàng'}</strong>
                  <p>{message.text}</p>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>

                {message.sender === 'bot' && Array.isArray(message.resourceLinks) && message.resourceLinks.length > 0 ? (
                  <div className="support-resource-links">
                    {message.resourceLinks.map((link) => (
                      /^https?:\/\//i.test(String(link.path || '')) ? (
                        <a
                          key={`${message.id}-${link.path}-${link.label}`}
                          className="support-resource-link"
                          href={link.path}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <strong>{link.label}</strong>
                          {link.description ? <span>{link.description}</span> : null}
                        </a>
                      ) : (
                        <Link key={`${message.id}-${link.path}-${link.label}`} className="support-resource-link" to={link.path}>
                          <strong>{link.label}</strong>
                          {link.description ? <span>{link.description}</span> : null}
                        </Link>
                      )
                    ))}
                  </div>
                ) : null}

                {message.sender === 'bot' && message.orderInfo ? (
                  <div className="support-order-card">
                    <strong>{message.orderInfo.orderNumber || 'Đơn hàng'}</strong>
                    <span>Trạng thái: {message.orderInfo.status || 'Chưa xác định'}</span>
                    {message.orderInfo.paymentMethod ? <span>Thanh toán: {message.orderInfo.paymentMethod}</span> : null}
                    {message.orderInfo.totalAmount ? <span>Tổng tiền: {Number(message.orderInfo.totalAmount || 0).toLocaleString('vi-VN')} đ</span> : null}
                    {message.orderInfo.update ? <p>{message.orderInfo.update}</p> : null}
                    {message.orderInfo.eta ? <p>{message.orderInfo.eta}</p> : null}
                  </div>
                ) : null}

                {message.sender === 'bot' && Array.isArray(message.recommendations) && message.recommendations.length > 0 ? (
                  <div className="support-recommendations">
                    {message.recommendations.map((product) => (
                      <div key={product.id} className="support-product-card">
                        <ProductArtwork product={product} className="support-product-image" imageClassName="support-product-image-media" />
                        <div className="support-product-body">
                          <strong>{product.name}</strong>
                          <span>{product.category}</span>
                          <span>{Number(product.price || 0).toLocaleString('vi-VN')} đ</span>
                          <span>{Number(product.stock || 0) > 0 ? `Còn ${Number(product.stock)} sản phẩm` : 'Hết hàng'}</span>
                          <span>Thuê từ {Number(product.rentalPrice || 0).toLocaleString('vi-VN')} đ/ngày</span>
                          <span>{product.players} | {product.age} | {product.playTime}</span>
                          <span>Đánh giá {Number(product.rating || 0).toFixed(1)}/5 ({Number(product.reviews || 0)} lượt đánh giá)</span>
                          <div className="support-product-actions">
                            <Link className="secondary-button" to={`/product/${product.id}`}>Xem chi tiết</Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            <div ref={threadBottomRef} />
          </div>

          <form className="support-composer" onSubmit={sendMessage}>
            <textarea
              rows="4"
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Nhập nội dung trao đổi với nhân viên hỗ trợ..."
            />
            <div className="support-composer-actions">
              <button type="button" className="secondary-button" disabled>Gửi hình ảnh</button>
              <button className="primary-button" type="submit">Gửi tin nhắn</button>
            </div>
          </form>
        </main>
      </div>
    </section>
  );
}

export default Support;