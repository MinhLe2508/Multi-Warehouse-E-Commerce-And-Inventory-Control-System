# Multi-Warehouse — khởi động Tuần 1

NestJS Backend + Next.js Frontend + PostgreSQL/pgvector + Redis. Dùng Node.js 24 và Docker Desktop (Linux containers, Compose v2). Repo đã có hai thư mục `backend/`, `frontend/`; không chạy lại CLI tạo dự án lên chúng. Giữ tên chữ thường vì Linux phân biệt hoa/thường.

## 1. Chuẩn bị

Clone repository bằng URL trên GitHub, rồi mở terminal tại thư mục có `docker-compose.yml`:

```powershell
git clone <URL_REPOSITORY>
cd Multi-Warehouse-E-Commerce-And-Inventory-Control-System
node --version
npm --version
docker --version
docker compose version
```

Trên Windows, cài [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/), bật WSL 2 theo trình cài đặt, mở Docker Desktop và đợi Engine sẵn sàng. Cài [Node.js 24](https://nodejs.org/en/download) nếu chạy npm. Mở lại terminal sau khi cài.

Thực hiện các lệnh dưới đây tại thư mục chứa `.git`, `backend`, `frontend` và `docker-compose.yml`.

## 2. Tạo cấu hình cá nhân

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Chỉ tạo `.env` ở lần thiết lập đầu. Khi chạy lại dự án, giữ file này; sao chép mẫu lần nữa sẽ ghi đè cổng, mật khẩu và secret đã chỉnh. macOS/Linux dùng `test -f .env || cp .env.example .env`. Sửa `.env`: thay `POSTGRES_PASSWORD`, cập nhật cùng mật khẩu trong `DATABASE_URL`, thay `JWT_SECRET`. Để đơn giản, dùng mật khẩu local dạng chữ/số/hex; ký tự đặc biệt trong URL phải percent-encode. Có thể sinh secret bằng:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`ANTHROPIC_API_KEY` để trống trong Tuần 1. JWT và API key mới là cấu hình dự phòng, chưa triển khai đăng nhập/chatbot. Chỉ commit `.env.example`, không commit `.env`.

## 3. Chạy nhanh bằng Docker

Theo đúng ba service trong ảnh:

```powershell
docker compose up -d
docker compose ps
Invoke-RestMethod http://localhost:3001/health
```

Compose tự build Backend ở lần đầu; các service dùng chung network mặc định. `backend` truy cập `postgres:5432`, `redis:6379`. Dữ liệu lưu trong named volumes. Khi sửa code, dùng `docker compose up -d --build`.

Muốn chạy cả Frontend trong Docker:

```powershell
docker compose --profile full up -d --build
```

Mở [Frontend](http://localhost:3000), [Backend health](http://localhost:3001/health). Trang chủ hiển thị trạng thái kết nối. Lần build đầu có thể mất vài phút tùy mạng/máy; lần sau tận dụng cache.

## 4. Chạy để lập trình, có tự tải lại

Tại thư mục gốc, dừng container App nếu đã chạy rồi chỉ bật hạ tầng:

```powershell
docker compose --profile full stop frontend backend
docker compose up -d postgres redis
Copy-Item .env backend/.env
cd backend
npm ci
npm run start:dev
```

Mở terminal thứ hai tại thư mục gốc:

```powershell
cd frontend
npm ci
npm run dev
```

`npm ci` cài đúng lockfile, dùng cho lần clone đầu và CI. Khi thêm thư viện, dùng `npm install <ten-thu-vien>` và commit cả `package.json` lẫn `package-lock.json`.

Backend tự đọc `backend/.env`; Compose đọc `.env` ở gốc. Sau khi sửa cấu hình gốc, cập nhật lại `backend/.env`. Frontend mặc định gọi Backend từ server tại `http://localhost:3001`. Nếu đổi cổng Backend, thêm `BACKEND_URL=http://localhost:<cong>` vào `frontend/.env.local`; không dùng tên `backend` khi chạy npm trên host. Không sao chép secret Backend vào Frontend.

## 5. Nghiệm thu Tuần 1

```powershell
docker compose ps
Invoke-RestMethod http://localhost:3001/health
docker compose exec postgres psql -U warehouse -d warehouse -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
docker compose exec redis redis-cli ping
```

Nếu đổi user/database trong `.env`, thay `warehouse` tương ứng. Kết quả mong đợi: health trả `status: ok` và ba thành phần `up`; truy vấn SQL có phiên bản vector; Redis trả `PONG`. `/health` thực sự truy vấn kiểu `vector` và ping Redis, trả HTTP 503 khi kết nối thất bại.

Kiểm tra mã trước khi push:

```powershell
cd backend
npx eslint "src/**/*.ts"
npm run build
cd ../frontend
npm run lint
npm run build
cd ..
git status --short
```

Đổi mật khẩu/cổng cần nhất quán giữa `.env`, URL local và origin. `PORT` là cổng Backend trên host; trong container Backend luôn chạy 3001. `FRONTEND_PORT` là cổng Frontend trên host; trong container luôn 3000. Đổi `FRONTEND_ORIGIN` tương ứng nếu đổi cổng Frontend.

## 6. Vai trò các file và CI/CD

| File | Công việc đã chuẩn bị |
| --- | --- |
| `docker-compose.yml` | 3 service mặc định; Frontend qua profile `full`; ports, volumes, healthcheck, thứ tự khởi động |
| `docker/postgres/01-vector.sql` | Bật extension vector khi tạo database lần đầu |
| `.env.example` | Mẫu cấu hình không chứa key thật |
| `.gitignore`, `*/.dockerignore` | Bỏ qua dependencies, build, secrets khỏi Git/Docker context |
| `backend/Dockerfile`, `frontend/Dockerfile` | Build nhiều stage, chạy bằng user `node` |
| `.github/workflows/ci.yml` | PR và push main/develop: npm ci, lint, build, dựng stack và kiểm tra kết nối |
| `.github/workflows/cd.yml` | Chạy thủ công từ main, publish hai image lên GHCR, tag bằng commit SHA |

Sau khi push: mở **GitHub → Actions → CI**, xem cả hai job kiểm tra và job integration. Thiết lập branch protection yêu cầu CI thành công trước merge. Để phát hành: tạo Environment `release` trong Settings → Environments, thêm reviewer nếu nhóm cần; chỉ chạy **Publish images (manual)** trên commit main đã qua CI. Workflow dùng `GITHUB_TOKEN` có quyền packages:write, không cần ghi PAT vào repo. Đây là khung CD publish image, chưa tự triển khai máy chủ vì chưa có đích deploy. Không có thao tác push/publish nào được thực hiện chỉ bằng việc tạo các file này.

## 7. Xử lý lỗi thường gặp

### Windows không cho mở cổng PostgreSQL 5432

Nếu log báo `ports are not available` hoặc `bind: An attempt was made to access a socket in a way forbidden by its access permissions`, đổi `POSTGRES_PORT=15432` trong `.env`. Đổi phần `localhost:5432` thành `localhost:15432` trong `DATABASE_URL` (và `backend/.env` nếu chạy npm), giữ nguyên user/mật khẩu/database. Kết nối bên trong Docker vẫn là `postgres:5432`.

```powershell
docker compose up -d --wait --wait-timeout 120
docker compose ps -a
Invoke-RestMethod http://localhost:3001/health
```

Không sao chép lại `.env.example` sau khi sửa. Nếu cổng 15432 cũng không khả dụng, chọn cổng host khác và cập nhật hai giá trị tương ứng.

### Health trả unavailable sau khi tạo lại .env

`Unable to connect` nghĩa là chưa kết nối được đến Backend; HTTP 503 với `status: unavailable` nghĩa là Backend đã nhận request nhưng không kiểm tra được PostgreSQL/pgvector hoặc Redis. Xem trạng thái và log:

```powershell
docker compose ps -a
docker compose logs --tail=80 postgres backend redis
```

Nếu log PostgreSQL báo `password authentication failed` sau khi ghi đè `.env`, khôi phục thông tin đăng nhập đã dùng lúc tạo volume. Đổi `.env` không tự đổi mật khẩu trong database hiện có. Không xóa volume để xử lý lỗi này nếu cần giữ dữ liệu.

Lệnh sinh secret chỉ in chuỗi ra màn hình; cần tự điền vào `JWT_SECRET` trong `.env`.

### Các trường hợp khác

- Không nhận lệnh `docker`: cài/mở Docker Desktop, mở lại terminal; kiểm tra `docker info`.
- Trùng cổng: dừng App đang chạy bằng Docker trước khi chạy npm, hoặc sửa cổng trong `.env` và URL tương ứng.
- Backend unhealthy: `docker compose logs --tail=100 backend postgres redis` rồi kiểm tra mật khẩu, database và extension.
- Volume đã tồn tại: script init chỉ chạy lần đầu. Bật extension bằng `docker compose exec postgres psql -U warehouse -d warehouse -c "CREATE EXTENSION IF NOT EXISTS vector;"`. Đổi `POSTGRES_PASSWORD` trong `.env` không tự đổi mật khẩu database đã tồn tại.
- Dừng và giữ dữ liệu: `docker compose --profile full down`. Không thêm `-v` nếu muốn giữ dữ liệu; tùy chọn đó xóa volumes.
- Prisma mới là khung schema, chưa có model/migration nghiệp vụ. Health check dùng `pg`; thiết kế schema và tích hợp Prisma Client thuộc bước tiếp theo.

Tham khảo chính thức: [NestJS](https://docs.nestjs.com/first-steps), [Next.js Docker](https://nextjs.org/docs/app/getting-started/deploying), [pgvector](https://github.com/pgvector/pgvector).
