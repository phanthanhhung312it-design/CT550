def answer_rules(message: str) -> str:
    text = (message or '').lower()
    if 'catan' in text:
        if any(token in text for token in ['chi tiet', 'chi tiết', 'huong dan', 'hướng dẫn', 'tung buoc', 'từng bước']):
            return 'Hướng dẫn Catan theo lượt: 1) Tung hai xúc xắc và phát tài nguyên theo các ô có số vừa gieo. 2) Giao dịch tài nguyên với người chơi hoặc ngân hàng. 3) Dùng tài nguyên để xây đường, khu dân cư, thành phố hoặc mua thẻ phát triển. 4) Kiểm tra điểm thắng, Đường dài nhất và Đội quân mạnh nhất. Mục tiêu là đạt 10 điểm trước đối thủ.'
        if any(token in text for token in ['sao', 'ngan', 'ngắn']):
            return 'Catan chơi như sau: tung xúc xắc nhận tài nguyên, giao dịch rồi dùng tài nguyên để xây dựng. Ai đạt 10 điểm trước sẽ thắng.'
        return 'Catan là trò chơi xây đường, dân cư và thành phố để đạt điểm thắng. Mỗi lượt bạn tung xúc xắc để nhận tài nguyên, sau đó dùng tài nguyên để xây dựng và ghi điểm.'
    if 'werewolf' in text:
        return 'Werewolf là game ẩn vai với vai trò sói và dân làng. Người chơi suy luận và phán đoán để tìm ra người đang lừa dối.'
    if 'wingspan' in text:
        return 'Wingspan là trò chơi xây dựng hệ sinh thái chim bằng cách thu thập thức ăn, đẻ trứng và phát triển loài chim.'
    if '7 wonders' in text:
        return '7 Wonders là trò chơi phát triển thành phố cổ đại qua nhiều thế kỷ, bạn xây dựng công trình và tính điểm bằng nhiều cách khác nhau.'
    return 'Mình có thể hướng dẫn luật chơi cho các game như Catan, Werewolf, Wingspan hoặc 7 Wonders. Bạn có thể hỏi cụ thể hơn.'
