import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addToCart } from './cartStorage';
import { getAuthUser } from './auth';
import ProductArtwork from './ProductArtwork';
import '../css/ChatbotBubble.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const CHATBOT_SESSION_KEY = 'boardgamevn-chatbot-session';

const defaultQuickReplies = [
  'Tìm game cho 4 người',
  'Luật chơi Catan',
  'Hỗ trợ thuê board game',
];

function createIntroMessage() {
  return {
    id: 'intro-message',
    sender: 'bot',
    text: 'Mình là Chatbot AI tư vấn BoardGame. Bạn có thể mô tả số người chơi, độ tuổi, thời gian chơi, độ khó, chủ đề yêu thích hoặc ngân sách để mình gợi ý chính xác hơn.',
    recommendations: [],
    quickReplies: defaultQuickReplies,
  };
}

async function fetchJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (networkError) {
    throw new Error('Không thể kết nối tới máy chủ chatbot. Vui lòng kiểm tra kết nối mạng và thử lại.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Không thể kết nối chatbot lúc này.');
  }

  return payload;
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

function ChatbotBubble() {
  const navigate = useNavigate();
  const messageEndRef = useRef(null);
  const [authState, setAuthState] = useState(getAuthUser());
  const authUser = authState?.user;
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState(() => window.localStorage.getItem(CHATBOT_SESSION_KEY) || '');
  const [messages, setMessages] = useState([createIntroMessage()]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [isTransferredToHuman, setIsTransferredToHuman] = useState(false);
  const escalationFlagKey = 'boardgamevn-chatbot-escalated';
  const chatHistoryRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const hasHydratedThreadRef = useRef(false);
  const lastPayloadSignatureRef = useRef('');
  const loadInFlightRef = useRef(false);

  const userId = authUser?.id || authUser?.userId || null;

  const quickReplies = useMemo(() => {
    const latestBotMessage = [...messages].reverse().find((message) => message.sender === 'bot' && Array.isArray(message.quickReplies) && message.quickReplies.length > 0);
    return latestBotMessage?.quickReplies || defaultQuickReplies;
  }, [messages]);

  useEffect(() => {
    function syncAuthState() {
      setAuthState(getAuthUser());
    }

    window.addEventListener('boardgamevn-auth-change', syncAuthState);
    window.addEventListener('storage', syncAuthState);
    return () => {
      window.removeEventListener('boardgamevn-auth-change', syncAuthState);
      window.removeEventListener('storage', syncAuthState);
    };
  }, []);

  const loadSession = useCallback(async () => {
    if (loadInFlightRef.current) {
      return;
    }

    loadInFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      if (sessionId) {
        params.set('sessionId', sessionId);
      }
      if (userId) {
        params.set('userId', String(userId));
      }

      const payload = await fetchJson(`/chatbot/session?${params.toString()}`);
      const payloadSignature = JSON.stringify((payload.messages || []).map((message) => [
        message?.tn_ma ?? message?.id ?? '',
        message?.sender || message?.tn_nguoigui || '',
        message?.created_at || message?.createdAt || '',
        message?.text || message?.tn_noidung || '',
      ]));

      const hasEscalatedSession = String(window.localStorage.getItem(escalationFlagKey) || '') === String(sessionId || '');
      if (!payload.sessionId) {
        setSessionId('');
        window.localStorage.removeItem(CHATBOT_SESSION_KEY);
        setIsTransferredToHuman(false);
        if (hasEscalatedSession) {
          setIsTransferredToHuman(true);
        }
        setMessages([createIntroMessage()]);
        hasHydratedThreadRef.current = false;
        lastPayloadSignatureRef.current = '';
        return;
      }

      setSessionId(payload.sessionId);
      window.localStorage.setItem(CHATBOT_SESSION_KEY, payload.sessionId);

      const nextIsTransferred = Boolean(payload.isHumanAssigned) || hasEscalatedSession;
      setIsTransferredToHuman(nextIsTransferred);

      if (payloadSignature === lastPayloadSignatureRef.current) {
        return;
      }

      lastPayloadSignatureRef.current = payloadSignature;

      if (Array.isArray(payload.messages) && payload.messages.length > 0) {
        setMessages([...payload.messages]
          .sort((left, right) => getMessageSortValue(left) - getMessageSortValue(right))
          .map((message) => ({
            ...message,
            text: repairVietnameseText(message.text),
          })));
        hasHydratedThreadRef.current = true;
      } else if (!hasHydratedThreadRef.current && !sessionId && !userId) {
        setMessages([createIntroMessage()]);
      }
    } catch (error) {
      setErrorMessage(error.message || 'Không thể tải lịch sử hội thoại.');
    } finally {
      loadInFlightRef.current = false;
    };
  }, [sessionId, userId]);

  useEffect(() => {
    if (!sessionId && !userId) {
      return undefined;
    }

    loadSession();
  }, [loadSession, sessionId, userId]);

  useEffect(() => {
    if (!sessionId && !userId) {
      return undefined;
    }

    const params = new URLSearchParams();
    if (sessionId) {
      params.set('sessionId', sessionId);
    }
    if (userId) {
      params.set('userId', String(userId));
    }

    const stream = new EventSource(`${API_BASE}/chatbot/stream?${params.toString()}`);

    const handleChatEvent = () => {
      loadSession();
    };

    stream.addEventListener('chat-event', handleChatEvent);
    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.removeEventListener('chat-event', handleChatEvent);
      stream.close();
    };
  }, [loadSession, sessionId, userId]);

  useEffect(() => {
    if (!sessionId && !userId) {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadSession, sessionId, userId]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isOpen]);

  function handleHistoryScroll() {
    const container = chatHistoryRef.current;
    if (!container) {
      return;
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceToBottom < 120;
  }

  async function handleSendMessage(nextText) {
    const text = String(nextText || inputValue).trim();
    if (!text || isLoading) {
      return;
    }

    const isEscalatedForThisSession = String(window.localStorage.getItem(escalationFlagKey) || '') === String(sessionId || '');
    if (isTransferredToHuman || isEscalatedForThisSession) {
      setStatusMessage('Cuộc trò chuyện này đã được chuyển cho nhân viên hỗ trợ. Vui lòng vào mục "Chat hỗ trợ" để tiếp tục trao đổi.');
      return;
    }

    const optimisticMessage = {
      id: `local-${Date.now()}`,
      sender: 'customer',
      text,
      recommendations: [],
    };

    setMessages((current) => [...current, optimisticMessage]);
    setInputValue('');
    setStatusMessage('');
    setErrorMessage('');
    setIsLoading(true);
    stickToBottomRef.current = true;

    try {
      const payload = await fetchJson('/chatbot/message', {
        method: 'POST',
        body: JSON.stringify({ sessionId, userId, message: text }),
      });

      if (payload.sessionId) {
        setSessionId(payload.sessionId);
        window.localStorage.setItem(CHATBOT_SESSION_KEY, payload.sessionId);
      }

      if (payload.message) {
        setMessages((current) => {
          // Luồng SSE có thể đã tải lại tin nhắn này từ MongoDB trước khi POST trả về.
          if (current.some((item) => item.id === payload.message.id)) {
            return current;
          }

          return [...current, {
            ...payload.message,
            text: repairVietnameseText(payload.message?.text),
          }];
        });
      } else if (payload.mode === 'employee') {
        setStatusMessage('Cuộc trò chuyện này đã được chuyển cho nhân viên hỗ trợ. Vui lòng vào mục "Chat hỗ trợ" để tiếp tục trao đổi.');
      } else if (payload.mode !== 'human-only') {
        setErrorMessage('Chatbot chưa có phản hồi phù hợp, vui lòng thử diễn đạt lại nhu cầu của bạn.');
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Chatbot chưa phản hồi được, vui lòng thử lại.');
      setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
    } finally {
      setIsLoading(false);
    }
  }

  function handleAddToCart(productId, productName) {
    addToCart(productId, 1);
    setStatusMessage(`Đã thêm ${productName} vào giỏ hàng.`);
  }

  async function handleRequestHuman() {
    if (isEscalating) {
      return;
    }

    if (!sessionId) {
      setStatusMessage('Hãy nhắn tin cho Chatbot AI trước khi yêu cầu gặp nhân viên nhé.');
      return;
    }

    setIsEscalating(true);
    setErrorMessage('');
    try {
      const response = await fetchJson('/chatbot/escalate', {
        method: 'POST',
        body: JSON.stringify({ sessionId, userId }),
      });

      if (response?.sessionId) {
        window.localStorage.setItem(escalationFlagKey, String(response.sessionId || sessionId || ''));
        window.localStorage.setItem('boardgamevn-support-session', String(response.sessionId || sessionId || ''));
        setIsTransferredToHuman(true);
        navigate(`/support?sessionId=${encodeURIComponent(response.sessionId || sessionId)}`);
        return;
      }

      setIsTransferredToHuman(true);
      navigate('/support');
    } catch (error) {
      setErrorMessage(error.message || 'Không thể chuyển tới nhân viên hỗ trợ lúc này.');
    } finally {
      setIsEscalating(false);
    }
  }

  return (
    <div className={`chatbot-shell ${isOpen ? 'is-open' : ''}`}>
      {isOpen ? (
        <section className="chatbot-panel card-surface" aria-label="Chatbot AI tư vấn BoardGame">
          <header className="chatbot-header">
            <div>
              <p className="eyebrow">Chatbot AI tư vấn BoardGame</p>
              <h3>Tư vấn chọn board game</h3>
            </div>
            <div className="chatbot-header-actions">
              <button type="button" className="chatbot-human-button" onClick={handleRequestHuman} disabled={isEscalating}>
                {isEscalating ? 'Đang chuyển...' : 'Gặp nhân viên'}
              </button>
              <button type="button" className="chatbot-close-button" onClick={() => setIsOpen(false)} aria-label="Thu gọn chatbot">−</button>
            </div>
          </header>

          <div className="chatbot-history" ref={chatHistoryRef} onScroll={handleHistoryScroll}>
            {messages.map((message) => (
              <article key={message.id} className={`chatbot-message ${getDisplayRole(message)}`}>
                <div className="chatbot-message-bubble">
                  <p>{message.text}</p>
                </div>

                {message.sender === 'bot' && Array.isArray(message.resourceLinks) && message.resourceLinks.length > 0 ? (
                  <div className="chatbot-resource-links">
                    {message.resourceLinks.map((link) => (
                      /^https?:\/\//i.test(String(link.path || '')) ? (
                        <a
                          key={`${message.id}-${link.path}-${link.label}`}
                          className="chatbot-resource-link"
                          href={link.path}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <strong>{link.label}</strong>
                          {link.description ? <span>{link.description}</span> : null}
                        </a>
                      ) : (
                        <Link key={`${message.id}-${link.path}-${link.label}`} className="chatbot-resource-link" to={link.path}>
                          <strong>{link.label}</strong>
                          {link.description ? <span>{link.description}</span> : null}
                        </Link>
                      )
                    ))}
                  </div>
                ) : null}

                {message.sender === 'bot' && message.orderInfo ? (
                  <div className="chatbot-order-card">
                    <strong>{message.orderInfo.orderNumber || 'Đơn hàng'}</strong>
                    <span>Trạng thái: {message.orderInfo.status || 'Chưa xác định'}</span>
                    {message.orderInfo.paymentMethod ? <span>Thanh toán: {message.orderInfo.paymentMethod}</span> : null}
                    {message.orderInfo.totalAmount ? <span>Tổng tiền: {Number(message.orderInfo.totalAmount || 0).toLocaleString('vi-VN')} đ</span> : null}
                    {message.orderInfo.update ? <p>{message.orderInfo.update}</p> : null}
                    {message.orderInfo.eta ? <p>{message.orderInfo.eta}</p> : null}
                  </div>
                ) : null}

                {message.sender === 'bot' && Array.isArray(message.recommendations) && message.recommendations.length > 0 ? (
                  <div className="chatbot-recommendations">
                    {message.recommendations.map((product) => (
                      <div key={product.id} className="chatbot-product-card">
                        <ProductArtwork product={product} className="chatbot-product-image" imageClassName="chatbot-product-image-media" />
                        <div className="chatbot-product-body">
                          <strong>{product.name}</strong>
                          <span>{product.category}</span>
                          <span>{Number(product.price || 0).toLocaleString('vi-VN')} đ</span>
                          <span>{Number(product.stock || 0) > 0 ? `Còn ${Number(product.stock)} sản phẩm` : 'Hết hàng'}</span>
                          <span>Thuê từ {Number(product.rentalPrice || 0).toLocaleString('vi-VN')} đ/ngày</span>
                          <span>{product.players} | {product.age} | {product.playTime}</span>
                          <span>Đánh giá {Number(product.rating || 0).toFixed(1)}/5 ({Number(product.reviews || 0)} lượt đánh giá)</span>
                          <div className="chatbot-product-actions">
                            <Link className="secondary-button" to={`/product/${product.id}`}>Xem chi tiết</Link>
                            <button type="button" className="secondary-button" onClick={() => handleAddToCart(product.id, product.name)}>Thêm vào giỏ</button>
                            <button type="button" className="primary-button" onClick={() => navigate('/rentals')}>Thuê ngay</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {isLoading ? <div className="chatbot-loading">Chatbot đang phân tích nhu cầu của bạn...</div> : null}
            <div ref={messageEndRef} />
          </div>

          <div className="chatbot-quick-replies">
            {quickReplies.map((item) => (
              <button key={item} type="button" className="chatbot-chip" onClick={() => handleSendMessage(item)}>{item}</button>
            ))}
          </div>

          {errorMessage ? <p className="chatbot-feedback error">{errorMessage}</p> : null}
          {statusMessage ? <p className="chatbot-feedback success">{statusMessage}</p> : null}

          <form
            className="chatbot-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleSendMessage(inputValue);
            }}
          >
            <input
              className="chatbot-input"
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Ví dụ: tìm game cho 4 người, 45 phút, dưới 700000"
            />
            <button type="submit" className="primary-button" disabled={isLoading || !inputValue.trim()}>Gửi</button>
          </form>
        </section>
      ) : null}

      <button type="button" className="chatbot-bubble" onClick={() => setIsOpen((current) => !current)} aria-label="Mở Chatbot AI tư vấn BoardGame">
        <img className="chatbot-bubble-avatar" src="/image/chatAI.jpg" alt="" aria-hidden="true" />
      </button>
    </div>
  );
}

export default ChatbotBubble;