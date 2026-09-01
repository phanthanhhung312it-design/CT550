import re


def normalize_text(value: str) -> str:
    return re.sub(r'\s+', ' ', (value or '').lower().strip()).translate(str.maketrans({
        'á': 'a', 'à': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
        'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
        'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
        'đ': 'd', 'é': 'e', 'è': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
        'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
        'í': 'i', 'ì': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ó': 'o', 'ò': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
        'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
        'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
        'ú': 'u', 'ù': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
        'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
        'ý': 'y', 'ỳ': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    }))


def detect_intent(message: str) -> str:
    text = normalize_text(message)
    if not text:
        return 'greeting'

    if re.search(r'\b(hi|hello|hey|xin chao|chao|chao ban|alo|co ai o day khong|ban oi|cho minh hoi|cam on|thanks|thank you|tam biet|bye|goodbye|hen gap lai|bai|ok|oke|okay|duoc roi)\b', text):
        return 'greeting'

    if any(token in text for token in ['luat choi', 'cach choi', 'choi nhu the nao', 'choi sao', 'huong dan choi', 'giai thich cach choi']):
        return 'rules'

    if any(token in text for token in ['game', 'goi y', 'de xuat', 'phu hop', 'tim boardgame', 'tim game', 'nguoi choi']) or re.search(r'\b(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(ng|nguoi)\b', text):
        return 'recommendation'

    if any(token in text for token in ['don hang', 'voucher', 'thanh toan', 'tai khoan', 'dang nhap', 'dang ky', 'mua hang', 'gio hang', 'ho tro']):
        return 'support'

    return 'unknown'
