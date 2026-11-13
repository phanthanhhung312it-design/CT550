# CT550 – BoardGame Nexus

Website bán BoardGame với chatbot hỗ trợ và gợi ý trò chơi bằng KNN. Frontend được xây dựng bằng React và **Vite**; backend dùng Express/Node.js, MongoDB và Python cho chatbot, gợi ý trò chơi.

## Công nghệ

- Frontend: React, Vite 6, React Router, Vitest.
- Backend: Node.js 22, Express, MongoDB/Mongoose.
- Gợi ý và chatbot: Python 3.
- Đóng gói: Docker, Docker Compose, Nginx.
- CI/CD: GitHub Actions; các Docker image được publish lên GitHub Container Registry (GHCR).

## Chạy local để phát triển

### Yêu cầu

- Node.js 22 trở lên và npm.
- Python 3.
- MongoDB đang chạy cục bộ (cần thiết cho các tính năng lưu và truy vấn dữ liệu).

### Cài đặt và khởi chạy

Từ thư mục gốc dự án, cài dependencies:

```sh
npm ci
npm ci --prefix server
```

Khởi chạy backend (mặc định cổng `5000`):

```sh
npm run server
```

Trong terminal khác, chạy frontend bằng Vite (mặc định cổng `5173`):

```sh
npm start
```

Mở http://localhost:5173. Vite proxy các request `/api` tới `http://localhost:5000`. Có thể đặt `VITE_DEV_API_TARGET` để đổi địa chỉ proxy. `VITE_API_BASE_URL` là địa chỉ API được đóng gói vào frontend lúc build; mặc định là `/api`.

Backend đọc cấu hình từ `server/.env`. Có thể tham khảo `server/.env.example`; ví dụ MongoDB local dùng `MONGODB_URI=mongodb://127.0.0.1:27017/boardgamevn`.

## Docker

### Chạy toàn bộ ứng dụng với Docker Compose (khuyến nghị)

Cần cài Docker Engine/Desktop và Docker Compose plugin. Từ thư mục gốc, tạo file `.env` từ mẫu `.env.example`, rồi thay `JWT_SECRET` bằng một giá trị riêng, đủ mạnh. Ví dụ PowerShell:

```powershell
Copy-Item .env.example .env
```

Khởi chạy cả MongoDB, backend và frontend:

```sh
docker compose up --build
```

- Website: http://localhost:8080
- Backend health check: http://localhost:5000/health
- MongoDB: chỉ truy cập nội bộ trong network Compose; dữ liệu được lưu bền vững ở volume `mongodb_data`.

Chạy nền bằng `docker compose up --build -d`. Xem log với `docker compose logs -f`; dừng các container bằng `docker compose down`. Lệnh `docker compose down -v` cũng xóa volume MongoDB và toàn bộ dữ liệu đã lưu.

Có thể đổi cổng publish trong `.env` bằng `WEB_PORT` (mặc định `8080`) và `API_PORT` (mặc định `5000`). Không dùng secret mặc định hoặc secret dùng cho phát triển ở môi trường production. Chatbot Python được đóng gói cùng backend; Node gọi Python bằng `python3` trong container.

### Dockerfile

- [Dockerfile](Dockerfile) build frontend nhiều giai đoạn: cài dependencies, chạy `npm run build` bằng Vite, sau đó phục vụ thư mục `dist/` bằng Nginx. Nginx fallback về `index.html` cho các route của SPA và chuyển tiếp `/api` tới backend.
- [server/Dockerfile](server/Dockerfile) cài dependencies production của Node.js và Python, sau đó chạy Express trên cổng `5000`. Image này cần build với thư mục gốc dự án làm build context vì nó cũng copy mã nguồn trong `py/`.
- [docker-compose.yml](docker-compose.yml) kết nối frontend, backend và MongoDB; backend đợi MongoDB healthy trước khi khởi chạy, còn frontend sử dụng backend làm upstream API.

Có thể build từng image từ thư mục gốc:

```sh
docker build -f Dockerfile -t boardgame-frontend .
docker build -f server/Dockerfile -t boardgame-backend .
```

## Kiểm thử và build

```sh
npm run test:ci
npm run build
npm test --prefix server
python -m unittest discover -s py -p "test_*.py"
```

`npm run build` tạo bản frontend production trong `dist/`. Vite cũng được dùng cho development server và Vitest; dự án không còn dùng Create React App.

## CI/CD với GitHub Actions

Workflow tại [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) chạy trên pull request và push vào `main` hoặc `master`:

1. Cài Node.js 22 và chạy test frontend (`npm run test:ci`), sau đó build Vite (`npm run build`).
2. Cài Node.js 22 và Python 3.12, chạy test backend (`npm test`) và test Python (`unittest`).
3. Nếu các bước kiểm tra thành công trên push vào `main`, build và publish image frontend/backend lên GHCR với tag `latest` và tag commit SHA.

CI dùng `GITHUB_TOKEN` với quyền `packages: write` để publish image. Workflow hiện **không tự triển khai qua SSH lên máy chủ**; muốn tự động deploy cần bổ sung cấu hình môi trường và secrets triển khai phù hợp. Khi triển khai thủ công, nên dùng image theo commit SHA để xác định chính xác phiên bản.
