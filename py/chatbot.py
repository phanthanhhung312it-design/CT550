import random
import re
import unicodedata

from intent import detect_intent
from game_rules import answer_rules
from recommend import recommend_games


def normalized_message(message: str) -> str:
    text = unicodedata.normalize('NFD', (message or '').lower())
    text = ''.join(character for character in text if unicodedata.category(character) != 'Mn')
    return text.replace('đ', 'd')


def extract_preferences(message: str) -> dict:
    text = normalized_message(message)
    preferences = {
        'players': None,
        'age': None,
        'play_time': None,
        'category': None,
        'difficulty': None,
        'budget': None,
    }

    number_words = {'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'nam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10}

    players_match = re.search(r'(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:-|den|toi da|d?n)?\s*(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)?\s*(nguoi|nguoi choi|ng|player|players)', text)
    if players_match:
        first_value = players_match.group(1)
        second_value = players_match.group(2)
        if second_value and second_value.isdigit():
            preferences['players'] = int(second_value)
        elif first_value and first_value.isdigit():
            preferences['players'] = int(first_value)
        elif first_value and first_value in number_words:
            preferences['players'] = number_words[first_value]

    age_match = re.search(r'(?:tuoi|tuoi|do tuoi)\s*(\d{1,2})\s*(?:\+)?', text)
    if not age_match:
        age_match = re.search(r'(\d{1,2})\s*\+\s*(?:tuoi|tuoi|do tuoi)', text)
    if age_match:
        preferences['age'] = int(age_match.group(1) or age_match.group(2))
    play_time = re.search(r'(\d+)\s*(phut|phut|p)\b', text)
    if play_time:
        preferences['play_time'] = int(play_time.group(1))
    elif 'nua tieng' in text or 'nua gio' in text:
        preferences['play_time'] = 30

    budget_match = re.search(r'(?:duoi|toi da|khong qua|<|tren|tu)\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu)?', text)
    if budget_match:
        value = float(budget_match.group(1).replace(',', '.'))
        unit = budget_match.group(2) or ''
        if unit in {'k', 'nghin', 'ngan'}:
            value *= 1000
        elif unit == 'trieu':
            value *= 1000000
        elif value < 10000:
            value *= 1000
        preferences['budget'] = int(value)

    range_match = re.search(r'(?:duoi|tren|toi da|khong qua|tu|gia|tien|khoang|tam|tầm)\s*(\d+(?:[.,]\d+)?)\s*(?:-|den|d?n)\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu)?', text)
    if not range_match:
        range_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:-|den|d?n)\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu)', text)
    if range_match:
        start = float(range_match.group(1).replace(',', '.'))
        end = float(range_match.group(2).replace(',', '.'))
        unit = range_match.group(3) or ''
        if unit in {'k', 'nghin', 'ngan'}:
            start *= 1000
            end *= 1000
        elif unit == 'trieu':
            start *= 1000000
            end *= 1000000
        elif start < 10000:
            start *= 1000
            end *= 1000
        preferences['budget'] = {'min': int(min(start, end)), 'max': int(max(start, end))}

    categories = {
        'chien luoc': 'Chiến lược', 'chien thuat': 'Chiến lược', 'chien-thuat': 'Chiến lược',
        'gia dinh': 'Gia đình', 'gia-dinh': 'Gia đình',
        'party': 'Party', 'tiec': 'Party',
        'logic': 'Logic', 'suy luan': 'Suy luận', 'suy-luan': 'Suy luận',
        'kinh te': 'Kinh tế', 'kinh-te': 'Kinh tế', 'hop tac': 'Hợp tác', 'hop-tac': 'Hợp tác',
    }
    for keyword, category in categories.items():
        if keyword in text:
            preferences['category'] = category
            break

    if re.search(r'\bde\b|\bde choi\b', text):
        preferences['difficulty'] = 'Dễ'
    elif re.search(r'\btrung binh\b|\btrung-binh\b', text):
        preferences['difficulty'] = 'Trung bình'
    elif re.search(r'\bkho\b|\bkhó\b', text):
        preferences['difficulty'] = 'Khó'
    return preferences


def build_support_topic_reply(message: str) -> str:
    text = normalized_message(message)

    if re.search(r'(voucher|ma giam gia|giam gia|khuyen mai)', text):
        if re.search(r'(khong dung duoc|khong ap dung|loi voucher|voucher bi loi|bi loi|het han|khong duoc|khong hoat dong)', text):
            return 'Bạn kiểm tra giúp mình thời hạn voucher, điều kiện áp dụng và giá trị đơn hàng tối thiểu nhé. Nếu voucher vẫn không sử dụng được, bạn có thể gửi mã voucher để mình hỗ trợ kiểm tra.'
        if re.search(r'(voucher cua toi|ma giam gia cua toi|co voucher|voucher nao)', text):
            return 'Bạn có thể kiểm tra các voucher đang được cấp trong tài khoản và xem điều kiện áp dụng trước khi thanh toán. Nếu cần, bạn có thể gửi mã voucher để mình kiểm tra nhanh hơn.'
        if re.search(r'(dung nhieu|nhieu voucher|cung luc)', text):
            return 'Việc dùng nhiều voucher cùng lúc phụ thuộc vào từng mã và chính sách áp dụng của đơn hàng. Mình khuyên bạn thử từng mã riêng lẻ để kiểm tra điều kiện phù hợp.'
        return 'Voucher có thể áp dụng khi thanh toán nếu bạn đạt điều kiện giá trị đơn tối thiểu, thời hạn còn hiệu lực và sản phẩm phù hợp. Nếu có mã, bạn có thể gửi lại để mình kiểm tra cụ thể.'

    if re.search(r'(don hang|don mua|trang thai don hang|dang o dau|don hang cua toi)', text):
        if re.search(r'(dang o dau|o dau|trang thai|da giao|dang giao|se den)', text):
            return 'Bạn có thể vào mục Đơn hàng của tôi để xem trạng thái đơn hàng. Nếu bạn gửi mã đơn hàng, mình có thể hỗ trợ kiểm tra thêm.'
        if re.search(r'(huy don|xoa don|huy)', text):
            return 'Bạn hãy gửi mã đơn hàng để mình kiểm tra trạng thái và hướng dẫn xử lý tiếp theo. Nếu đơn chưa được giao, cửa hàng có thể hỗ trợ hủy hoặc chốt đơn tùy tình trạng thực tế.'
        return 'Bạn có thể mở mục Đơn hàng của tôi để xem trạng thái và thời gian cập nhật. Nếu muốn, hãy gửi mã đơn để mình kiểm tra thêm.'

    if re.search(r'(thanh toan|loi thanh toan|khong thanh toan|thanh toan khong duoc|momo|vnpay|cod)', text):
        return 'Bạn có thể kiểm tra lại phương thức thanh toán, thông tin giao dịch và kết nối mạng. Nếu vẫn gặp lỗi, hãy thử lại hoặc chọn phương thức thanh toán khác.'

    if re.search(r'(gio hang|san pham trong gio hang|gio hang bi mat|mat san pham|khong thay san pham)', text):
        return 'Bạn kiểm tra lại tài khoản đang đăng nhập và trang giỏ hàng. Nếu sản phẩm vẫn không hiển thị, mình có thể hỗ trợ kiểm tra giỏ hàng của bạn.'

    if re.search(r'(tai khoan|dang nhap|mat khau|quen mat khau|tai khoan bi khoa|bi khoa)', text):
        if re.search(r'(bi khoa|khoa|bao ve|xem lai)', text):
            return 'Bạn nên kiểm tra lại tài khoản đang đăng nhập, mật khẩu và email/số điện thoại đã xác thực. Nếu tài khoản đã bị khóa, hãy liên hệ hỗ trợ để xác minh lại thông tin.'
        return 'Bạn có thể kiểm tra lại thông tin đăng nhập, đổi mật khẩu hoặc xác minh tài khoản trong mục Tài khoản. Nếu vẫn gặp sự cố, mình sẽ hướng dẫn bạn liên hệ hỗ trợ phù hợp.'

    return ''


def build_greeting_reply(message: str) -> str:
    normalized = normalized_message(message)

    if any(token in normalized for token in ['cam on', 'thanks', 'thank you']):
        return random.choice([
            'Rất vui được hỗ trợ bạn! Nếu cần tư vấn game, kiểm tra đơn hàng hoặc giải đáp thắc mắc, cứ nhắn mình nhé.',
            'Không có gì! Mình luôn sẵn sàng giúp bạn chọn game, xem đơn hàng hoặc hỗ trợ các vấn đề bạn gặp phải.',
            'Cảm ơn bạn đã tin tưởng. Mình có thể hỗ trợ bạn tìm boardgame phù hợp hoặc kiểm tra nhanh các vấn đề liên quan.',
        ])

    if any(token in normalized for token in ['tam biet', 'bye', 'goodbye', 'hen gap lai', 'bai']):
        return random.choice([
            'Tạm biệt bạn! Hẹn gặp lại khi cần tư vấn game hoặc hỗ trợ đơn hàng.',
            'Bye nhé! Nếu cần thêm thông tin, mình luôn sẵn sàng hỗ trợ bạn.',
            'Chúc bạn nhiều trải nghiệm game vui vẻ. Hẹn gặp lại bạn sau nhé!',
        ])

    if any(token in normalized.split() for token in ['ok', 'oke', 'okay', 'uh', 'u']) or 'duoc roi' in normalized:
        return random.choice([
            'Được rồi. Bạn muốn mình gợi ý trò chơi, hướng dẫn luật chơi hay hỗ trợ đơn hàng thì cứ nói rõ nhé.',
            'Oke, bạn cần hỗ trợ gì thì cứ mô tả rõ giúp mình nhé.',
            'Mình nghe rồi. Bạn có thể hỏi về game, đơn hàng hoặc các vấn đề thanh toán / voucher của mình.',
        ])

    if any(token in normalized for token in ['alo', 'ban oi', 'co ai o day khong', 'cho minh hoi', 'xin chao', 'chao ban', 'chao', 'hi', 'hello', 'hey']):
        return random.choice([
            'Xin chào! Mình có thể giúp bạn tìm boardgame phù hợp, hướng dẫn cách chơi hoặc hỗ trợ các vấn đề về đơn hàng.',
            'Chào bạn! Mình ở đây để tư vấn game, hỗ trợ hỏi đáp nhanh và giải quyết các thắc mắc về đơn hàng, voucher, thanh toán hoặc tài khoản.',
            'Hi! Mình có thể giúp bạn chọn boardgame phù hợp, giải thích luật chơi hoặc hỗ trợ kiểm tra các vấn đề liên quan đến đơn hàng nhé.',
            'Alo! Mình sẵn sàng hỗ trợ bạn tìm game, hướng dẫn cách chơi hoặc giải đáp các câu hỏi về đơn hàng, voucher và thanh toán.',
        ])

    return random.choice([
        'Xin chào! Mình có thể giúp bạn tìm boardgame phù hợp, hướng dẫn cách chơi hoặc hỗ trợ các vấn đề về đơn hàng.',
        'Chào bạn! Mình có thể tư vấn game, hỗ trợ thuê/đặt hàng và giải đáp thắc mắc về thanh toán, voucher, tài khoản nhé.',
    ])


def build_recommendation_reply(message: str, catalog_names: list[str] | None = None, top_k: int = 5) -> dict:
    preferences = extract_preferences(message)
    effective_top_k = max(5, int(top_k or 5))

    def mongo_lookup(product_id: object, product_name: object):
        if not (product_id or product_name):
            return None
        candidates = list(catalog_names or [])
        if product_name and str(product_name).strip():
            candidates.append(str(product_name))
        if not candidates:
            return None
        for name in candidates:
            if str(name).strip().casefold() == str(product_name or '').strip().casefold():
                return {
                    'id': product_id,
                    'name': product_name,
                    'currentPrice': 0,
                    'price': 0,
                    'category': 'Board game',
                    'image': '',
                    'rating': 0,
                    'reviews': 0,
                    'stock': 0,
                }
        return None

    recommendations = recommend_games(preferences, top_k=effective_top_k, catalog_names=catalog_names, mongo_lookup=mongo_lookup)
    if not recommendations:
        preference_summary = []
        if preferences.get('players'):
            preference_summary.append(f"{preferences['players']} người")
        if preferences.get('play_time'):
            preference_summary.append(f"{preferences['play_time']} phút")
        if preferences.get('budget'):
            preference_summary.append('ngân sách phù hợp')
        if preferences.get('difficulty'):
            preference_summary.append(f"độ khó {preferences['difficulty']}")
        if preferences.get('category'):
            preference_summary.append(f"thể loại {preferences['category']}")

        summary = ', '.join(preference_summary) if preference_summary else 'tiêu chí bạn cung cấp'
        return {
            'intent': 'recommendation',
            'reply': f'Hiện chưa có sản phẩm nào phù hợp với tất cả yêu cầu của bạn: {summary}. Nếu bạn muốn, hãy liên hệ nhân viên hỗ trợ để được tư vấn chính xác nhất qua Chat hỗ trợ.',
            'recommendations': [],
            'preferences': preferences,
        }

    return {
        'intent': 'recommendation',
        'reply': 'Dựa trên nhu cầu của bạn, mình đề xuất các game phù hợp và có thể giúp bạn chọn một trò chơi phù hợp hơn.',
        'recommendations': recommendations,
        'preferences': preferences,
    }


def create_reply(
    message: str,
    products: list[dict[str, object]] | None = None,
    catalog_names: list[str] | None = None,
    top_k: int = 5,
) -> dict:
    intent = detect_intent(message)
    normalized = normalized_message(message)
    if intent == 'rules':
        return {
            'intent': intent,
            'reply': answer_rules(message),
            'recommendations': [],
        }

    if intent == 'recommendation':
        return build_recommendation_reply(message, catalog_names=catalog_names, top_k=top_k)

    if intent == 'greeting':
        reply = build_greeting_reply(message)
        return {
            'intent': intent,
            'reply': reply,
            'recommendations': [],
        }

    if intent == 'support':
        specific_reply = build_support_topic_reply(message)
        if specific_reply:
            return {
                'intent': intent,
                'reply': specific_reply,
                'recommendations': [],
            }
        return {
            'intent': intent,
            'reply': 'Bạn có thể hỏi về sản phẩm, đơn hàng, voucher, thanh toán hoặc tài khoản. Mình sẽ cố gắng hỗ trợ nhanh nhất.',
            'recommendations': [],
        }

    return {
        'intent': intent,
        'reply': 'Mình chưa tìm được thông tin phù hợp với yêu cầu của bạn. Vui lòng mô tả rõ hơn hoặc liên hệ nhân viên hỗ trợ để được tư vấn chính xác nhất qua Chat hỗ trợ.',
        'recommendations': [],
    }
