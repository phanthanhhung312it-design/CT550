export const navigationItems = [
  { label: 'Trang chủ', path: '/' },
  { label: 'Danh mục BoardGame', path: '/catalog' },
  { label: 'Thuê BoardGame', path: '/rentals' },
  { label: 'Flash Sale', path: '/flash-sale' },
  { label: 'Đơn hàng của tôi', path: '/orders' },
  { label: 'Hàng mới', path: '/new-arrivals' },
  { label: 'Best sellers', path: '/best-sells' },
  { label: 'Chat hỗ trợ', path: '/support' },
  { label: 'Blog', dropdown: true },
];

export const blogMenuItems = [
  { label: '🎲 Review Board Game', path: '/blog?topic=review-board-game' },
  { label: '📰 Tin Tức', path: '/blog?topic=tin-tuc' },
  { label: '📖 Hướng Dẫn Cách Chơi', path: '/blog?topic=huong-dan-cach-choi' },
  { label: '💡 Kiến Thức Board Game', path: '/blog?topic=kien-thuc-board-game' },
  { label: '♟️ Chiến Thuật', path: '/blog?topic=chien-thuat' },
  { label: '🎉 Party Game', path: '/blog?topic=party-game' },
];

export const footerContent = {
  storeName: 'Board Game VN',
  copyright: `© ${new Date().getFullYear()} Board Game VN. Tất cả quyền được bảo lưu.`,
  description: 'Cửa hàng board game chính hãng với danh mục sản phẩm, thuê game và hỗ trợ khách hàng đồng bộ trên toàn website.',
  contact: {
    address: '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    phone: '0969 914 344',
    email: 'support@boardgamevn.vn',
  },
  quickLinks: [
    { label: 'Trang chủ', path: '/' },
    { label: 'Danh mục BoardGame', path: '/catalog' },
    { label: 'Thuê BoardGame', path: '/rentals' },
    { label: 'Best Sellers', path: '/best-sells' },
    { label: 'Blog', path: '/blog' },
    { label: 'Liên hệ', path: '/support' },
  ],
  socialLinks: [
    { label: 'Facebook', shortLabel: 'fb', icon: 'f', href: 'https://facebook.com/boardgamevn' },
    { label: 'Instagram', shortLabel: 'ig', icon: 'ig', href: 'https://instagram.com/boardgamevn' },
    { label: 'YouTube', shortLabel: 'yt', icon: 'yt', href: 'https://youtube.com/@boardgamevn' },
    { label: 'TikTok', shortLabel: 'tt', icon: 'tt', href: 'https://tiktok.com/@boardgamevn' },
  ],
};

export const products = [
  { id: 1, name: 'Catan', category: 'Chiến lược', brand: 'Kosmos', publisher: 'Kosmos', players: '3-4', age: '10+', price: 890000, rating: 4.9, reviews: 248, image: '/image/catan.jpg', labels: ['Bán chạy', 'Gia đình'], description: 'Chiếm đất, giao thương tài nguyên và xây dựng chiến lược để dẫn đầu hòn đảo Catan.' },
  { id: 2, name: 'Ticket to Ride', category: 'Gia đình', brand: 'Days of Wonder', publisher: 'Days of Wonder', players: '2-5', age: '8+', price: 760000, rating: 4.8, reviews: 186, image: '/image/tickettoride.jpg', labels: ['Dễ học', 'Du lịch'], description: 'Xây dựng mạng lưới đường sắt xuyên lục địa bằng cách chinh phục các tuyến tàu quan trọng.' },
  { id: 3, name: 'Azul', category: 'Logic', brand: 'Plan B Games', publisher: 'Plan B Games', players: '2-4', age: '8+', price: 650000, rating: 4.7, reviews: 159, image: '/image/azul.jpg', labels: ['Đẹp mắt', 'Thi đấu nhanh'], description: 'Sắp xếp gạch màu thành những mẫu mosaic tinh xảo với luật chơi đơn giản nhưng sâu sắc.' },
  { id: 4, name: 'Dixit', category: 'Sáng tạo', brand: 'Libellud', publisher: 'Libellud', players: '3-6', age: '8+', price: 720000, rating: 4.8, reviews: 132, image: '/image/dixit.jpg', labels: ['Kể chuyện', 'Gia đình'], description: 'Khai thác trí tưởng tượng qua bộ tranh đầy ẩn dụ và những vòng đoán ý thú vị.' },
  { id: 5, name: 'Splendor', category: 'Kinh tế', brand: 'Space Cowboys', publisher: 'Space Cowboys', players: '2-4', age: '10+', price: 840000, rating: 4.9, reviews: 214, image: '/image/splendor.jpg', labels: ['Cao cấp', 'Chiến thuật'], description: 'Thu thập đá quý, phát triển bộ engine và cạnh tranh để chinh phục tầng lớp quý tộc.' },
  { id: 6, name: 'Pandemic', category: 'Hợp tác', brand: 'Z-Man Games', publisher: 'Z-Man Games', players: '2-4', age: '13+', price: 920000, rating: 4.8, reviews: 177, image: '/image/pandemic.jpg', labels: ['Co-op', 'Khó hơn'], description: 'Lập nhóm cùng nhau ngăn chặn dịch bệnh lan rộng trên toàn cầu bằng các quyết định phối hợp.' },
  { id: 7, name: 'Mysterium', category: 'Suy luận', brand: 'Libellud', publisher: 'Libellud', players: '2-7', age: '10+', price: 950000, rating: 4.6, reviews: 98, image: '/image/MYSTERIUM.jpg', labels: ['Nhập vai', 'Nhóm đông'], description: 'Giải mã manh mối từ thế giới linh hồn để tìm ra hung thủ, địa điểm và hung khí.' },
  { id: 8, name: 'Sushi Go!', category: 'Party', brand: 'Grey Fox Games', publisher: 'Grey Fox Games', players: '2-5', age: '6+', price: 350000, rating: 4.5, reviews: 321, image: '/image/sushigo.jpg', labels: ['Nhanh', 'Nhập môn'], description: 'Game thẻ nhẹ nhàng, phù hợp tiệc nhóm và người mới làm quen với BoardGame.' },
  { id: 9, name: 'Carcassonne', category: 'Chiến lược', brand: 'Rio Grande Games', publisher: 'Rio Grande Games', players: '2-5', age: '7+', price: 690000, rating: 4.8, reviews: 145, image: '/image/carcassonne.jpg', labels: ['Mới thêm', 'Chiến thuật'], description: 'Xây thành phố, nông trại và con đường bằng cách ghép các mảnh bản đồ để mở rộng lãnh thổ.' },
  { id: 10, name: '7 Wonders', category: 'Chiến lược', brand: 'Repos Production', publisher: 'Repos Production', players: '3-7', age: '10+', price: 980000, rating: 4.9, reviews: 201, image: '/image/7wonders.jpg', labels: ['Cổ điển', 'Draft'], description: 'Phát triển nền văn minh cổ đại qua nhiều kỷ nguyên với nhịp chơi nhanh và nhiều lựa chọn.' },
  { id: 11, name: 'Wingspan', category: 'Gia đình', brand: 'Stonemaier Games', publisher: 'Stonemaier Games', players: '1-5', age: '10+', price: 1090000, rating: 4.9, reviews: 168, image: '/image/wingspan.jpg', labels: ['Thư giãn', 'Đẹp mắt'], description: 'Xây dựng hệ sinh thái chim bằng cách kết hợp thức ăn, tổ và kỹ năng theo từng loài.' },
  { id: 12, name: 'Werewolf', category: 'Party', brand: 'Bezier Games', publisher: 'Bezier Games', players: '7-75', age: '13+', price: 420000, rating: 4.4, reviews: 367, image: '/image/werewolf.jpg', labels: ['Đông người', 'Suy luận'], description: 'Trò chơi ẩn vai kinh điển dành cho nhóm đông, nơi người chơi phải tìm ra ai là sói.' },
  { id: 13, name: 'Deception: Murder in Hong Kong', category: 'Suy luận', brand: 'Grey Fox Games', publisher: 'Grey Fox Games', players: '4-12', age: '14+', price: 890000, rating: 4.7, reviews: 128, image: '/image/deceptioninhongkong.jpg', labels: ['Điều tra', 'Team play'], description: 'Một vụ án mạng căng thẳng với manh mối ẩn và những suy luận khó đoán giữa người chơi.' },
  { id: 14, name: 'Chinatown', category: 'Kinh tế', brand: 'Z-Man Games', publisher: 'Z-Man Games', players: '3-5', age: '12+', price: 760000, rating: 4.5, reviews: 86, image: '/image/chinatown.jpg', labels: ['Đàm phán', 'Thương lượng'], description: 'Mua bán và thương lượng đất đai để xây dựng khu phố sinh lợi nhất giữa lòng Chinatown.' },
];

export const orders = [
  { id: 'DH-2486', status: 'Đã xác nhận', update: '09:20 - Hệ thống đã ghi nhận thanh toán MOMO.', eta: 'Giao trước 18:00 hôm nay' },
  { id: 'DH-2482', status: 'Đang đóng gói', update: '08:10 - Cửa hàng đã đóng gói 2 sản phẩm.', eta: 'Dự kiến gửi xe chiều nay' },
  { id: 'DH-2475', status: 'Đang giao', update: 'Hôm qua - Đơn đã bàn giao đơn vị vận chuyển.', eta: 'Dự kiến đến trong 1 ngày' },
];

export const rentalProducts = products.map((product) => ({
  productId: product.id,
  name: product.name,
  category: product.category,
  players: product.players,
  image: product.image,
  stock: Math.max(1, Math.floor((product.reviews || 1) / 20)),
  rentalPricePerDay: Math.max(10000, Math.round(product.price * 0.1)),
  deposit: Math.min(100000, Math.max(50000, Math.round(product.price * 0.35))),
  maxRentalDays: 14,
}));

export const rentalOptions = {
  addresses: [
    {
      id: 1,
      userId: 2,
      recipientName: 'Phan Thanh Hung',
      addressLine: '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      isDefault: true,
      phone: '0901000002',
    },
    {
      id: 2,
      userId: 2,
      recipientName: 'Phan Thanh Hung',
      addressLine: '98 Võ Văn Tần, Quận 3, TP. Hồ Chí Minh',
      isDefault: false,
      phone: '0901000002',
    },
    {
      id: 3,
      userId: 2,
      recipientName: 'Phan Thanh Hung',
      addressLine: '215 Phạm Văn Đồng, Bình Thạnh, TP. Hồ Chí Minh',
      isDefault: false,
      phone: '0901000002',
    },
  ],
  paymentMethods: [
    { id: 1, name: 'COD', description: 'Thanh toán khi nhận board game' },
    { id: 2, name: 'MOMO', description: 'Thanh toán qua ví MOMO' },
    { id: 3, name: 'VNPay', description: 'Thanh toán qua cổng VNPay' },
  ],
  shippingUnits: [
    { id: 1, name: 'Giao hàng nhanh', description: 'Giao trong ngày khu vực nội thành', fee: 35000 },
    { id: 2, name: 'Giao hàng tiết kiệm', description: 'Phù hợp đơn hàng toàn quốc', fee: 18000 },
  ],
  vouchers: [
    { id: 1, code: 'SALE50K', title: 'Giảm 50.000 đ', type: 2, value: 50000, maxDiscount: 50000, minAmount: 500000 },
    { id: 2, code: 'SUMMER15', title: 'Giảm 15%', type: 1, value: 15, maxDiscount: 150000, minAmount: 800000 },
  ],
};

export const rentalOrders = [
  {
    id: 1,
    rentalNumber: 'DT-00001',
    customerId: 2,
    customerName: 'Phan Thanh Hung',
    receiveDate: '2026-07-10',
    returnDate: '2026-07-17',
    actualReturnDate: null,
    paymentMethod: 'COD',
    shippingUnit: 'Giao hàng nhanh',
    paymentStatus: 'Chưa thanh toán',
    status: 'Chờ xác nhận',
    voucherCode: 'SALE50K',
    totalRentalFee: 455000,
    totalDeposit: 320000,
    shippingFee: 0,
    voucherDiscount: 50000,
    totalAmount: 725000,
    refundDeposit: 0,
    items: [
      {
        id: 1,
        productId: 6,
        name: 'Pandemic',
        quantity: 1,
        rentalDays: 7,
        rentalPricePerDay: 65000,
        depositPerItem: 320000,
        lineRentalFee: 455000,
        lineDeposit: 320000,
      },
    ],
  },
];

export const reviews = [
  {
    id: 1,
    reviewCode: 'DG-00001',
    userId: 2,
    customerName: 'Phan Thanh Hung',
    customerEmail: 'customer@boardgame.vn',
    productId: 1,
    productName: 'Catan',
    orderId: 'DH-2486',
    orderStatus: 'Hoàn thành',
    rating: 5,
    content: 'Rất đáng mua.',
    status: 'Hiển thị',
    createdAt: '2026-07-11T10:00:00.000Z',
  },
  {
    id: 2,
    reviewCode: 'DG-00002',
    userId: 2,
    customerName: 'Phan Thanh Hung',
    customerEmail: 'customer@boardgame.vn',
    productId: 9,
    productName: 'Carcassonne',
    orderId: 'DH-2482',
    orderStatus: 'Hoàn thành',
    rating: 5,
    content: 'Chơi nhiều lần vẫn vui.',
    status: 'Chờ duyệt',
    createdAt: '2026-07-12T08:30:00.000Z',
  },
];

export const supportTips = [
  'Tư vấn game theo độ tuổi và số người chơi.',
  'Hỗ trợ thanh toán PayPal, VNPAY và MOMO.',
  'Theo dõi trạng thái đơn hàng theo thời gian thực.',
];

export const blogPosts = [
  {
    id: 1,
    title: 'Review BoardGame chiến thuật mới nhất',
    date: '2026-05-25T00:00:00.000Z',
    excerpt: 'Thiết kế hình ảnh theo nhịp của trang boardgame.vn với các khối nội dung rõ ràng dưới danh sách sản phẩm.',
    category: 'Review',
  },
  {
    id: 2,
    title: 'Những board game hợp cho nhóm bạn',
    date: '2026-05-25T00:00:00.000Z',
    excerpt: 'Bố cục nhiều section giúp trang chủ giống một storefront thương mại điện tử thực thụ hơn.',
    category: 'Gợi ý chơi',
  },
  {
    id: 3,
    title: 'Tại sao flash sale lại quan trọng',
    date: '2026-05-24T00:00:00.000Z',
    excerpt: 'Phần mô phỏng nhịp trưng bày deal và sự kiện của boardgame.vn.',
    category: 'Khuyến mãi',
  },
  {
    id: 4,
    title: 'Board game 2 người nên chọn gì',
    date: '2026-05-23T00:00:00.000Z',
    excerpt: 'Các tựa chơi đối kháng, tốc độ nhanh và dễ mở bàn cho hai người.',
    category: '2 người',
  },
  {
    id: 5,
    title: 'Party game cho cuối tuần',
    date: '2026-05-22T00:00:00.000Z',
    excerpt: 'Những game tiệc dễ kéo nhóm bạn vào bàn chơi rất nhanh.',
    category: 'Party',
  },
  {
    id: 6,
    title: 'Mẹo chọn game theo độ tuổi',
    date: '2026-05-21T00:00:00.000Z',
    excerpt: 'Lọc board game theo độ tuổi để giữ trải nghiệm phù hợp hơn cho cả nhóm.',
    category: 'Hướng dẫn',
  },
];

export const bestSellerProducts = [...products]
  .sort((left, right) => right.reviews - left.reviews)
  .map((product, index) => ({
    ...product,
    rank: index + 1,
  }));