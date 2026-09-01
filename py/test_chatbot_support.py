import sys
import unicodedata
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from chatbot import create_reply


class ChatbotSupportReplyTests(unittest.TestCase):
    def normalize(self, value: str) -> str:
        text = unicodedata.normalize('NFD', (value or '').lower())
        text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn').replace('\n', ' ')
        return text.replace('đ', 'd')

    def test_voucher_issue_has_specific_guidance(self):
        reply = create_reply('Voucher của tôi không dùng được')['reply']
        normalized = self.normalize(reply)
        self.assertIn('voucher', normalized)
        self.assertTrue(
            any(keyword in normalized for keyword in ['thoi han', 'dieu kien', 'gia tri don hang toi thieu', 'ma voucher'])
        )

    def test_order_status_has_specific_guidance(self):
        reply = create_reply('Đơn hàng của tôi đang ở đâu?')['reply']
        normalized = self.normalize(reply)
        self.assertIn('don hang', normalized)
        self.assertTrue(
            any(keyword in normalized for keyword in ['don hang cua toi', 'trang thai', 'ma don', 'don hang'])
        )

    def test_payment_issue_has_specific_guidance(self):
        reply = create_reply('Tôi thanh toán không được')['reply']
        normalized = self.normalize(reply)
        self.assertIn('thanh toan', normalized)
        self.assertTrue(
            any(keyword in normalized for keyword in ['phuong thuc', 'ket noi mang', 'thanh toan', 'phuong thuc thanh toan'])
        )

    def test_cart_issue_has_specific_guidance(self):
        reply = create_reply('Sản phẩm trong giỏ hàng bị mất')['reply']
        normalized = self.normalize(reply)
        self.assertIn('gio hang', normalized)
        self.assertTrue(
            any(keyword in normalized for keyword in ['gio hang', 'dang nhap', 'tai khoan'])
        )

    def test_account_issue_has_specific_guidance(self):
        reply = create_reply('Tài khoản của tôi bị khóa')['reply']
        normalized = self.normalize(reply)
        self.assertIn('tai khoan', normalized)
        self.assertTrue(
            any(keyword in normalized for keyword in ['tai khoan', 'dang nhap', 'mat khau', 'xac minh'])
        )

    def test_range_budget_and_player_condition_are_parsed(self):
        reply = create_reply('Tìm game 5 người, 500 - 900k')
        preferences = reply['preferences']
        self.assertEqual(preferences['players'], 5)
        self.assertIsNone(preferences['age'])
        self.assertIsInstance(preferences['budget'], dict)
        self.assertGreaterEqual(preferences['budget']['min'], 500000)
        self.assertLessEqual(preferences['budget']['max'], 900000)

        reply2 = create_reply('game 5-6 nguoi tren 900k chien thuat')
        preferences2 = reply2['preferences']
        self.assertEqual(preferences2['players'], 6)
        self.assertIsInstance(preferences2['budget'], int)
        self.assertGreaterEqual(preferences2['budget'], 900000)

    def test_unknown_question_requires_support_fallback(self):
        reply = create_reply('Tôi muốn hỏi về máy giặt mới')
        normalized = self.normalize(reply['reply'])
        self.assertIn('thong tin phu hop', normalized)
        self.assertIn('lien he nhan vien ho tro', normalized)
        self.assertIn('chat ho tro', normalized)

    def test_basic_greetings_are_understood(self):
        greetings = [
            'Xin chào',
            'Chào bạn',
            'Chào',
            'Hi',
            'Hello',
            'Hey',
            'Alo',
            'Có ai ở đây không?',
            'Bạn ơi',
            'Cho mình hỏi',
            'Cảm ơn',
            'Thanks',
            'Thank you',
            'Ok',
            'Oke',
            'Được rồi',
            'Tạm biệt',
            'Bye',
            'Goodbye',
        ]

        for greeting in greetings:
            reply = create_reply(greeting)['reply']
            self.assertTrue(reply and len(reply) > 10, f'Greeting reply is empty for: {greeting}')


if __name__ == '__main__':
    unittest.main()
