# Backup hệ thống TimeApp / LionGolf Time

> Tài liệu này ghi lại chức năng, logic xử lý, cách dùng, cách chạy local, cách deploy và cách backup source code của dự án TimeApp. Nội dung được tổng hợp từ source trong bản backup hiện tại. Không ghi secret, token, mật khẩu hoặc chuỗi kết nối thật vào tài liệu này.

## 1. Mục tiêu hệ thống

TimeApp là hệ thống nội bộ dùng để xử lý bảng chấm công LionGolf từ file Excel máy chấm công, đối chiếu dữ liệu nhân viên, giờ đăng ký và Diary/Ghi chú để xuất file Excel kết quả hoàn chỉnh.

Hệ thống hỗ trợ:

- Đăng nhập và phân quyền theo vai trò.
- Quản lý nhân viên và giờ đăng ký.
- Quản lý Diary/Ghi chú nhân viên, trạng thái Có phép/Không phép và file đính kèm.
- Xử lý một file chấm công.
- Xử lý nhiều file chấm công theo hàng đợi, lọc theo chi nhánh/nhân viên/ngày và xuất file tổng hợp.
- Tự động tính Đi sớm, Đi trễ, Phạt, Về sớm, Tăng ca, Trừ khác, Tổng làm.
- Tô màu, ghi chú, cảnh báo dữ liệu bất thường và tạo summary theo nhân viên.
- Tạo sheet riêng cho từng nhân viên trong file Excel xuất ra.
- Lưu dữ liệu trên Postgres/Neon; file đính kèm dùng Vercel Blob ở production hoặc local fallback khi dev.
- Deploy full-stack trên Vercel bằng React/Vite và Express API chạy qua Vercel Function.

## 2. Công nghệ sử dụng

- Frontend: React 18, Vite.
- Backend: Node.js, Express 5.
- Database: Postgres serverless qua `@neondatabase/serverless`, ưu tiên Neon.
- File storage: `@vercel/blob` khi có `BLOB_READ_WRITE_TOKEN`; local fallback trong thư mục data khi dev.
- Excel: `xlsx` và `xlsx-js-style`.
- Auth: session token lưu localStorage ở frontend, token hash lưu DB ở bảng `sessions`.
- Password hash: `bcryptjs`.
- PWA: service worker, manifest, hỗ trợ cài app và offline shell cơ bản.

## 3. Cấu trúc thư mục chính

```text
api/index.mjs                         Entry Vercel Function, import Express app
server.mjs                            Entry server local/production
server/app.mjs                        Compose Express app, route, middleware, frontend
server/bootstrap/                     Compose repository/service/controller/guard
server/config/                        Runtime config từ env
server/controllers/                   Controller API
server/db/                            Kết nối Postgres/Neon
server/middlewares/                   Auth, upload, JSON body, error middleware
server/repositories/                  Data access layer
server/routes/                        Khai báo REST routes
server/services/                      Nghiệp vụ backend
server/storage/                       Lưu/xóa file local hoặc Vercel Blob
server/utils/                         Date, text, serializer, HTTP error
server/web/                           Register frontend build/dev middleware
src/App.jsx                           App shell, session, navigation, page render
src/api/                              API client frontend
src/auth/                             Phân quyền frontend
src/branches/                         Nhận diện/chuẩn hóa chi nhánh
src/components/                       UI pages và component con
src/constants/                        Cột Excel, màu, role, rule constants
src/diary/                            Model, import/export, lookup, merge Diary
src/employees/                        Model và import/export nhân viên
src/excel/                            Pipeline đọc/xử lý/ghi Excel
src/hooks/                            State/data/actions cho các page
src/rules/                            Shift rule engine
src/services/attendance/              Logic nghiệp vụ chấm công tách nhỏ
src/styles/                           CSS theo module
src/utils/                            Date/time/process helpers
migrations/001_init.sql               Schema Postgres
scripts/migrate.mjs                   Chạy migration
scripts/seed.mjs                      Seed tài khoản mặc định
scripts/migrate-sqlite-to-postgres.mjs Migrate dữ liệu SQLite cũ sang Postgres
verify-*.mjs                          Bộ test/verification nội bộ
public/manifest.webmanifest           PWA manifest
public/sw.js                          Service worker
public/images/                        Logo/hình ảnh public
vercel.json                           Cấu hình build, rewrite và function duration
```

## 4. Vai trò và phân quyền

### 4.1 Role hiện có

- `Admin`: toàn quyền.
- `Manager`: chỉ thao tác dữ liệu trong chi nhánh được gán.
- `User`: có khai báo trong constants nhưng hiện UI/API chính chưa mở page cho role này.

### 4.2 Quyền theo page frontend

Admin thấy các page:

- `Xử lý chấm công`
- `Xử lý`
- `Nhân viên / Giờ ĐK`
- `Diary / Ghi chú`
- `Account`

Manager thấy các page:

- `Nhân viên / Giờ ĐK`
- `Diary / Ghi chú`

Trang mặc định sau login:

- Admin: `Xử lý chấm công`.
- Manager: `Nhân viên / Giờ ĐK`.

### 4.3 Quyền dữ liệu chi nhánh

Chi nhánh chuẩn đang hỗ trợ:

- `NHC`
- `Q7`
- `RC`
- `TD`
- `OL`

Hệ thống tự nhận diện alias chi nhánh từ tên/mã/field text, ví dụ:

- `Q7`, `Quận 7`, `Quan 7` -> `Q7`
- `OL`, `Outlet`, `Online`, `ONL` -> `OL`
- `TD`, `Thủ Đức` -> `TD`
- `RC`, `Rạch Chiếc` -> `RC`
- `NHC` -> `NHC`

Admin được xem/sửa toàn bộ. Manager chỉ được xem/sửa dữ liệu thuộc đúng chi nhánh của tài khoản. Backend vẫn kiểm tra quyền theo branch, không chỉ dựa vào UI.

### 4.4 Quyền thao tác chính

| Chức năng | Admin | Manager |
|---|---:|---:|
| Xử lý chấm công 1 file | Có | Không |
| Xử lý nhiều file / tổng hợp | Có | Không |
| Xem nhân viên | Có | Chỉ chi nhánh được gán |
| Thêm/sửa nhân viên | Có | Chỉ chi nhánh được gán |
| Xóa nhân viên | Có | Không |
| Import/export nhân viên | Có | Không |
| Xem Diary | Có | Chỉ chi nhánh được gán |
| Thêm/sửa Diary | Có | Chỉ chi nhánh được gán |
| Xóa Diary đơn | Có | Backend yêu cầu Admin cho route xóa đơn |
| Import/export/bulk Diary | Có | Có, nhưng bị ép về chi nhánh của Manager |
| Upload/xem file Diary | Có | Có, trong chi nhánh |
| Sửa/xóa file Diary | Có | Chỉ file do chính Manager đó upload và cùng chi nhánh |
| Account management | Có | Không |
| Audit logs | Có | Không |

## 5. Chức năng theo màn hình

## 5.1 Đăng nhập

Đường dẫn API:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Luồng hoạt động:

1. Người dùng nhập username/password.
2. Backend normalize username, kiểm tra tài khoản, trạng thái `Active`, password hash.
3. Tạo token random, lưu token hash vào bảng `sessions`.
4. Frontend lưu session vào localStorage key `timekeeping.authSession.v1`.
5. Mỗi API request kèm `Authorization: Bearer <token>`.
6. Khi logout, backend xóa session và frontend xóa localStorage.

Trường hợp lỗi:

- Sai username/password: trả lỗi đăng nhập.
- Tài khoản bị khóa: trả 403.
- Session hết hạn hoặc token không hợp lệ: trả 401.

## 5.2 PWA / cài app

Hệ thống có:

- `public/manifest.webmanifest`
- `public/sw.js`
- `src/registerServiceWorker.js`
- `useInstallPrompt`

Chức năng:

- Có thể hiện nút cài app khi trình duyệt hỗ trợ `beforeinstallprompt`.
- Theo dõi trạng thái online/offline.
- Cache app shell cơ bản: `/`, `/index.html`, manifest, icon, logo.
- Không cache API.

## 5.3 Trang Xử lý chấm công

Mục tiêu: xử lý một file Excel `.xlsx` từ máy chấm công.

Điều kiện file:

- Định dạng `.xlsx`.
- Tối đa 25 MB ở frontend.
- Phải có sheet `Chi tiết`.
- Header được tìm trong 50 dòng đầu.
- Các cột chính phải có đủ theo cấu hình `REQUIRED_COLUMNS`.
- Các cột optional có thể thiếu: `Giờ ĐK`, `Vào 2`, `Ra 2`, `Vào 1 (Shop)`, `Ra 1 (Shop)`, `Vào 2 (Shop)`, `Ra 2 (Shop)`, `TC1`, `TC2`, `TC3`, `Tổng cộng`.

Luồng dùng:

1. Vào page `Xử lý chấm công`.
2. Chọn hoặc kéo thả file `.xlsx`.
3. Bấm `Xử lý file`.
4. Hệ thống đọc sheet `Chi tiết`, match nhân viên, Diary và tính công.
5. Xem preview tối đa 100 dòng.
6. Bấm tải file Excel kết quả.

Kết quả hiển thị:

- Số dòng khớp nhân viên.
- Số dòng chưa có giờ đăng ký.
- Số dòng tự điều chỉnh Vào/Ra.
- Số dòng khớp Diary.
- Số dòng Diary Có phép.
- Preview highlight theo loại phát sinh.

Tên file xuất:

```text
yyyy-mm-tên_chi_nhánh.xlsx
```

Ví dụ:

```text
2026-06-Q7.xlsx
2026-06-OL.xlsx
```

Nếu không xác định chi nhánh thì dùng fallback theo logic file name.

## 5.4 Trang Xử lý

Mục tiêu: xử lý nhiều file chấm công, có bộ lọc và có thể xuất tổng hợp.

Chức năng:

- Upload nhiều file `.xlsx`.
- Mỗi file có trạng thái riêng: pending, processing, success, error.
- Lỗi ở một file không làm dừng các file khác.
- Lọc theo chi nhánh.
- Lọc theo nhân viên.
- Tìm nhân viên theo mã/tên/chi nhánh.
- Lọc theo ngày từ/đến.
- Bật/tắt `Chỉ xuất dòng khớp bộ lọc` khi xuất riêng.
- Khi xuất tổng hợp, hệ thống luôn chỉ xuất dòng khớp bộ lọc.
- Có hai kiểu xuất:
  - `Xuất 1 file tổng hợp`.
  - `Xuất từng file riêng`.

File tổng hợp có:

- Sheet `Tổng hợp`.
- Thêm cột `Chi nhánh`.
- Thêm cột `Nguồn file`.
- Summary box theo nhân viên.
- Sheet riêng theo từng nhân viên.
- Sheet `Không tìm thấy` nếu chọn nhân viên nhưng không có dữ liệu trong file upload.

Tên file tổng hợp:

```text
yyyy-mm-phạm_vi.xlsx
```

Ví dụ:

```text
2026-06-Q7.xlsx
2026-06-Q7_OL.xlsx
2026-06-Tong_hop.xlsx
```

## 5.5 Trang Nhân viên / Giờ ĐK

Mục tiêu: quản lý dữ liệu nền để tính ca và chấm công.

Cột nhân viên:

- `Chi nhánh`
- `Mã N.Viên`
- `Tên N.Viên`
- `Giờ ĐK`
- `Vào sáng`
- `Ra sáng`
- `Vào chiều`
- `Ra chiều`
- `Vào Tối`
- `Ra Tối`
- `Ghi chú`

Chức năng:

- Xem danh sách nhân viên.
- Tìm kiếm.
- Lọc theo chi nhánh.
- Lọc theo nhóm nhân viên.
- Lọc theo giờ đăng ký.
- Thêm nhân viên.
- Sửa nhân viên.
- Checkbox chọn từng dòng.
- Checkbox chọn toàn bộ dòng đang hiển thị.
- Xóa các dòng đã chọn: Admin only.
- Import/export danh sách nhân viên bằng `RegisHours.xlsx`: Admin only.

Nhóm nhân viên được nhận diện từ tiền tố tên:

- `VP-` -> nhóm VP.
- `Bep-` -> nhóm Bếp.
- `Cafe-`, `Ca phe-`, `Caphe-` -> nhóm Cafe.
- Còn lại -> Normal.

Match nhân viên khi xử lý chấm công:

1. Ưu tiên `Mã N.Viên`.
2. Nếu mã trống thì fallback theo `Tên N.Viên`.
3. Mã số được normalize để các dạng `403`, `00403`, `000403` cùng ra mã chuẩn 5 chữ số.

## 5.6 Trang Diary / Ghi chú

Mục tiêu: ghi nhận lý do, phép/không phép, loại ghi chú và hồ sơ đính kèm để đối chiếu khi xử lý chấm công.

Trường Diary:

- `Ngày`
- `Mã N.Viên`
- `Tên N.Viên`
- `Vào 1`
- `Ra 1`
- `Vào 2`
- `Ra 2`
- `Ghi chú`
- `Có/Không phép`
- `Loại ghi chú`
- `Người lập biên bản`
- `File đính kèm`
- `Chi nhánh`
- `Mã người lập`
- `Ngày tạo`
- `Ngày cập nhật`

Loại ghi chú hiện có:

- `Đi sớm`
- `Đi trễ`
- `Về sớm`
- `Tăng ca`
- `OFF`
- `Khác`
- `Hỗ trợ CN`

Logic checkbox Loại ghi chú:

- Chọn `OFF` thì chỉ còn `OFF`, không được chọn thêm loại khác.
- Nếu đang chọn `OFF`, các checkbox khác bị disable.
- `Đi trễ` và `Đi sớm` loại trừ nhau.
- `Về sớm` và `Tăng ca` loại trừ nhau.
- `Khác` dùng để chuyển phát sinh `Đi trễ` hoặc `Về sớm` sang cột `Trừ khác` khi có Diary đúng loại.
- `Hỗ trợ CN` là loại ghi chú nghiệp vụ, vẫn lưu và xuất/import cùng Diary.

Chức năng:

- Thêm Diary.
- Sửa Diary.
- Xem chi tiết Diary.
- Tìm kiếm.
- Lọc theo ngày.
- Lọc theo tháng.
- Lọc theo nhân viên.
- Lọc theo loại ghi chú.
- Lọc theo Có phép/Không phép.
- Checkbox chọn từng dòng.
- Checkbox chọn toàn bộ dòng đang hiển thị.
- Xóa nhiều dòng theo checkbox nếu có quyền.
- Import/export file Diary `.xlsx`.
- Upload file đính kèm.
- Xem ảnh/PDF trực tiếp.
- Tải file đính kèm.
- Xóa/thay thế file đính kèm nếu có quyền.

Import Diary:

- File `.xlsx`.
- Không bắt buộc đúng tên sheet, hệ thống tìm sheet có đủ header trong 50 dòng đầu.
- Các cột bắt buộc: `Mã N.Viên`, `Tên N.Viên`, `Ngày`, `Vào 1`, `Ra 1`, `Ghi chú`.
- Các cột optional: `Vào 2`, `Ra 2`, `Có/Không phép`, `Loại ghi chú`, `Người lập biên bản`.
- Các alias được hỗ trợ, ví dụ `Mã nhân viên`, `Tên nhân viên`, `Lý do`, `Có / Không phép`, `Trạng thái phép`, `Loại`, `Note type`, `Người lập`.

Export Diary:

- File xuất mặc định: `Diary.xlsx`.
- Sheet xuất: `Diary`.
- Có cột `File đính kèm`, ghi danh sách tên file.

File đính kèm Diary:

- Định dạng cho phép: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`.
- Mặc định tối đa 20 MB/file, đổi bằng env `ATTACHMENT_MAX_MB`.
- Metadata lưu trong DB bảng `diary_attachments`.
- Production nên dùng Vercel Blob qua `BLOB_READ_WRITE_TOKEN`.
- Local dev thiếu Blob token thì lưu vào thư mục local theo `TIMEKEEPING_DATA_DIR`.

## 5.7 Trang Account

Mục tiêu: Admin quản lý tài khoản đăng nhập.

Chức năng:

- Xem danh sách tài khoản.
- Thêm tài khoản.
- Sửa tài khoản.
- Reset mật khẩu.
- Khóa/mở tài khoản qua trạng thái `Active`/`Inactive`.
- Xóa tài khoản.
- Gán role.
- Gán chi nhánh cho Manager.
- Hiển thị số Manager đang hoạt động.

API liên quan:

- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id`
- `POST /api/accounts/:id/password`
- `DELETE /api/accounts/:id`

## 5.8 Audit log

Hệ thống có audit log cho các thao tác quan trọng như:

- Login failed.
- Login blocked.
- Upload attachment.
- Replace attachment.
- Delete attachment.
- Delete all attachments for Diary.
- Các action frontend gửi qua `logAction`.

API:

- `POST /api/audit-logs`: user đăng nhập có thể ghi log.
- `GET /api/audit-logs`: Admin only.

Bảng DB: `audit_logs`.

## 5.9 Health check

API:

```text
GET /api/health
```

Trả trạng thái service, thời gian và tình trạng database. Khi thiếu `DATABASE_URL`, health vẫn trả service ok nhưng database có thể là `unavailable`.

## 6. Logic Excel đầu vào/đầu ra

## 6.1 Sheet nguồn

Sheet nguồn bắt buộc:

```text
Chi tiết
```

Header được dò trong 50 dòng đầu.

## 6.2 Cột giữ lại

Các cột giữ trong kết quả:

```text
STT
Mã N.Viên
Tên N.Viên
Ngày
Thứ
Vào 1
Ra 1
Vào 2
Ra 2
Vào 1 (Shop)
Ra 1 (Shop)
Vào 2 (Shop)
Ra 2 (Shop)
Tổng giờ
Giờ ĐK
```

Các cột `(Shop)` được ghi từ Diary nếu Diary có nhập mốc vào/ra. Khi có clock từ Diary, hệ thống dùng clock Shop để tính thay cho clock máy chấm công.

## 6.3 Cột loại bỏ

Các cột legacy bị loại khỏi output:

```text
Ngày Công
TC1
TC2
TC3
Tổng cộng
```

Các cột này có thể vắng mặt mà không làm lỗi pipeline.

## 6.4 Cột tính thêm

Các cột được thêm vào kết quả:

```text
Đi sớm
Đi trễ
Phạt
Về sớm
Tăng ca
Trừ khác
Ghi chú
Tổng làm
```

Sau đó có thêm cột summary:

```text
Nhân viên
Tổng
```

## 6.5 Preview

- Preview tối đa 100 dòng.
- Preview dùng cùng metadata highlight với file Excel xuất ra.
- Dòng đã match Diary có metadata riêng để hiển thị trạng thái.

## 7. Logic tính chấm công

## 7.1 Match nhân viên

Khi xử lý từng dòng:

1. Đọc `Mã N.Viên` và `Tên N.Viên`.
2. Nếu cả hai trống thì bỏ qua dòng.
3. Tìm nhân viên trong danh sách Employees:
   - Ưu tiên mã nhân viên sau normalize.
   - Fallback theo tên nhân viên.
4. Nếu không tìm thấy nhân viên:
   - Không tính ca.
   - Ghi chú `Chưa có giờ đăng ký`.
   - Vẫn giữ `Tổng làm` theo dữ liệu `Tổng giờ` nếu có thể parse.

## 7.2 Normalize và điều chỉnh Vào/Ra

Hệ thống đọc 4 slot chính:

- `Vào 1` -> `in1`
- `Ra 1` -> `out1`
- `Vào 2` -> `in2`
- `Ra 2` -> `out2`

Sau đó phân loại lại clock bằng khoảng cách tới mốc vào/ra đã đăng ký của nhân viên.

Ý nghĩa:

- Nếu một mốc đang nằm ở cột `Vào` nhưng gần giờ `Ra` hơn thì có thể chuyển sang cột `Ra`.
- Nếu một mốc đang nằm ở cột `Ra` nhưng gần giờ `Vào` hơn thì có thể chuyển sang cột `Vào`.
- Khi không còn slot trống, hệ thống giữ nguyên và ghi note điều chỉnh.
- Adjustment log lưu lại clock gốc, clock đã chỉnh, dòng Excel và ghi chú.

## 7.3 Clock từ Diary / Shop

Nếu Diary cùng ngày + nhân viên có nhập `Vào 1/Ra 1/Vào 2/Ra 2`, hệ thống:

- Ghi các mốc này vào cột `Vào 1 (Shop)`, `Ra 1 (Shop)`, `Vào 2 (Shop)`, `Ra 2 (Shop)`.
- Dùng các mốc Shop để tính công.
- Tính lại `Tổng giờ` từ cặp Shop nếu có đủ cặp vào/ra.
- Ghi thêm note dạng `Diary: <lý do>`.

## 7.4 Xác định ca

Các ca mặc định lấy từ hồ sơ nhân viên:

- Sáng: `Vào sáng` / `Ra sáng`
- Chiều: `Vào chiều` / `Ra chiều`
- Tối: `Vào Tối` / `Ra Tối`

Nguyên tắc chọn ca:

- Nếu có rule gán ca thì ưu tiên ca từ rule.
- Nếu không có rule, chọn ca có giờ vào gần giờ vào thực tế nhất.
- Nếu không có giờ vào, dùng giờ ra làm fallback.
- `Giờ ĐK` được dùng làm tiêu chí phụ khi các ca có điểm gần nhau.
- Nếu ca qua nửa đêm, giờ ra được cộng thêm 24h để tính đúng.

## 7.5 Rule VP Thứ 7

Nhân viên VP được nhận diện khi tên bắt đầu `VP-`.

Thứ 7 có hai ca 4 tiếng:

- `08:00-12:00`
- `09:00-13:00`

Hệ thống chọn ca VP Thứ 7 dựa theo mốc vào/ra gần thực tế nhất.

Riêng VP Thứ 7:

- `Tổng làm` không trừ thêm 1 giờ nghỉ trưa.
- Tăng ca VP vẫn có thể hiển thị theo ngày nhưng không cộng vào tổng tăng ca.

## 7.6 Rule Q7 Thứ 2

Áp dụng khi:

- Nhân viên thuộc chi nhánh `Q7`.
- Ngày chấm công là Thứ 2.
- Nhân viên thuộc nhóm `NORMAL`, không phải VP/Bếp/Cafe.

Khung hoạt động Q7 Thứ 2:

- Mở: `09:00`
- Đóng: `21:00`

Logic:

- Ca được co vào khung `09:00-21:00`.
- Nếu `Giờ ĐK` vượt phần có thể làm trong khung hoạt động, phần thiếu được cộng vào `Về sớm` với note:

```text
Về sớm do Giờ ĐK vượt giờ hoạt động Q7 Thứ 2: <số phút> phút
```

## 7.7 Rule Thủ Đức

Hệ thống có helper nhận diện nhân viên Thủ Đức từ:

- Chi nhánh.
- Tên nhân viên.
- Mã nhân viên.

Nhân viên TD không áp dụng logic full-day morning-to-afternoon đặc biệt.

## 7.8 Full-day / tăng ca full ngày

Logic full-day morning-to-afternoon:

- Áp dụng khi vào ca sáng và ra gần mốc ra ca chiều.
- Ngưỡng match mốc ra chiều: 90 phút.
- Không áp dụng cho nhân viên Thủ Đức.
- Khi xác định full-day, tăng ca được tính từ giờ kết thúc theo `Giờ ĐK` đến giờ ra thực tế được giới hạn trong mốc ra chiều.

Note ví dụ:

```text
Tăng ca full ngày: tính từ 15:30 đến 21:00
```

## 7.9 Tính Tổng làm

`Tổng làm` lấy từ `Tổng giờ` hoặc từ clock Shop nếu Diary có clock Shop.

Logic hiện tại:

- Parse tổng giờ thành phút.
- Mặc định trừ 60 phút nghỉ trưa.
- Không làm tròn.
- Không âm: `max(0, tổng phút sau xử lý)`.
- VP Thứ 7 không trừ 60 phút nghỉ trưa.
- Xuất Excel dạng time number với format `[hh]:mm`.

## 7.10 Đi trễ

- So sánh giờ vào thực tế với giờ vào ca đã chọn.
- Nếu vào sớm hơn hoặc đúng giờ: `Đi trễ = 0`.
- Nếu vào sau giờ ca: `Đi trễ = số phút chênh lệch`.
- Tổng đi trễ vẫn dùng `totalLateMinutes` để cộng summary, trừ khi chuyển sang `Trừ khác`.

## 7.11 Phạt đi trễ

Logic tính phạt:

- Nếu `lateMinutes` rỗng/null: không tính.
- Nếu trễ dưới 15 phút: 0.
- Nhân viên VP: từ mốc phạt trở đi phạt cố định `70.000`.
- Nhân viên khác: phạt theo block 60 phút, công thức:

```text
70.000 * 2^(ceil(lateMinutes / 60) - 1)
```

Ví dụ:

- Trễ 16-60 phút: 70.000.
- Trễ 61-120 phút: 140.000.
- Trễ 121-180 phút: 280.000.

Nếu Diary `Đi trễ` có `Có phép`, tiền phạt về 0 nhưng phút đi trễ vẫn có thể được ghi nhận theo logic tổng.

## 7.12 Đi sớm

- `Đi sớm` là số phút nhân viên vào trước giờ vào ca.
- Hiện logic tổng `validEarlyInMinutes` đang để 0 trong resolver, nghĩa là phát sinh có thể hiển thị/audit nhưng không cộng tổng Đi sớm nếu không mở lại flag auto count.
- Có note `Đi sớm <x> phút` khi phát sinh.

## 7.13 Về sớm

- Chọn giờ ra thực tế ưu tiên `Ra 2`, fallback `Ra 1`.
- So sánh với giờ ra chuẩn của ca.
- Nếu ra trước giờ chuẩn: `Về sớm = số phút chênh lệch`.
- `Về sớm` phát sinh luôn cộng vào tổng `validEarlyMinutes`, trừ khi được chuyển sang `Trừ khác`.

## 7.14 Tăng ca

- Tăng ca mặc định = giờ ra thực tế - giờ kết thúc theo `Giờ ĐK`/ca chuẩn.
- Nhóm FULL có logic riêng: so `Tổng làm` với số phút đăng ký.
- VP không cộng tổng tăng ca.
- Hiện đã tắt auto cộng tăng ca trên 60 phút.
- Chỉ Diary loại `Tăng ca` + `Có phép` mới được cộng vào tổng tăng ca.
- Nếu chưa có Diary phép, note:

```text
Tăng ca chưa có Diary phép - không cộng tổng
```

## 7.15 Trừ khác

`Trừ khác` dùng khi Diary có tick loại `Khác` cho các phát sinh:

- `Đi trễ`
- `Về sớm`

Khi khớp Diary loại `Khác`:

- Số phút phát sinh được chuyển sang `Trừ khác`.
- `Đi trễ` hoặc `Về sớm` tương ứng bị đưa về 0.
- Phạt đi trễ bị đưa về 0 nếu phát sinh đi trễ đã chuyển sang Trừ khác.
- Ghi chú có prefix `Trừ khác (<loại gốc>)`.

## 7.16 OFF và OFF dài ngày

Nhận diện OFF khi:

- Không có clock vào/ra.
- Tổng làm rỗng hoặc <= 0.
- Hoặc ghi chú có `OFF`.

OFF dài ngày:

- Hệ thống tìm chuỗi OFF liên tiếp theo nhân viên.
- Từ 2 ngày liên tiếp trở lên được đánh dấu long OFF.
- Đối chiếu Diary với loại `OFF > 2 ngày`/`OFF`.
- Ghi note:

```text
OFF > 2 ngày chưa có Diary
OFF > 2 ngày có phép: <lý do>
OFF > 2 ngày không phép: <lý do>
```

## 7.17 Mốc chấm công bất thường

Một dòng được xem là bình thường khi:

- Có `Vào 1` hợp lệ.
- Có `Ra 1` hợp lệ.
- Không có `Vào 2`.
- Không có `Ra 2`.

Các trường hợp khác có clock thì được xem là bất thường. Nếu thiếu đầu vào hoặc đầu ra, hệ thống đánh dấu `missingClock`.

Note:

```text
Mốc chấm công bất thường, cần kiểm tra
```

## 7.18 Diary và trạng thái vi phạm

Các loại vi phạm được đối chiếu Diary:

- `Đi sớm`
- `Đi trễ`
- `Về sớm`
- `Tăng ca`

Trạng thái:

- `permitted`: có Diary và Có phép.
- `notPermitted`: có Diary nhưng Không phép.
- `missingDiary`: chưa có Diary.
- `otherDeduction`: chuyển sang Trừ khác.
- `autoTotal`: tự tính tổng theo rule auto nếu bật.

Quy tắc đáng chú ý:

- `Đi trễ` có phép: phạt = 0.
- `Đi trễ` không phép hoặc thiếu Diary: giữ phạt theo rule.
- `Về sớm`: vẫn cộng tổng, trừ khi chuyển sang `Trừ khác`.
- `Tăng ca`: chỉ cộng tổng nếu Diary loại `Tăng ca` và `Có phép`.
- `Tăng ca VP`: không cộng tổng.
- `Đi sớm`: hiện không cộng tổng.
- Diary match được ghi vào `diaryMatchLogs` gồm dòng, mã/tên nhân viên, ngày, loại vi phạm, lý do, phép, người lập, số file đính kèm, phạt trước/sau.

## 7.19 Highlight màu Excel/preview

Màu theo loại phát sinh:

- `Đi sớm`: xanh nhạt.
- `Đi trễ`: cam nhạt.
- `Về sớm`: đỏ/hồng nhạt.
- `Tăng ca`: tím nhạt.
- OFF dài ngày: đỏ/hồng nhạt ở cột Ghi chú.
- Mốc chấm công bất thường: vàng nhạt ở các ô clock liên quan.
- Thiếu clock: cam ở cột Ghi chú.

Border theo trạng thái Diary:

- Có phép: xanh.
- Không phép: đỏ.
- Thiếu Diary: cam.
- Full-day: xanh dương.
- Auto total: tím đậm.

## 7.20 Summary box

Summary box được ghi cạnh bảng trong sheet `Chi tiết` hoặc `Tổng hợp`.

Các dòng summary:

- `Nhân viên`
- `Tổng công`
- `Đi sớm`
- `Đi trễ`
- `Phạt`
- `Về sớm`
- `Tăng ca`
- `Trừ khác`

Nguyên tắc tổng:

- `Tổng công`: đếm ngày làm trong tháng báo cáo mới nhất của file, bỏ tháng trước nếu file có kéo dữ liệu cuối tháng trước.
- `Đi trễ`: cộng tổng phút trễ thực tế sau khi xử lý Trừ khác.
- `Phạt`: cộng tiền phạt.
- `Về sớm`: cộng `validEarlyMinutes`.
- `Tăng ca`: cộng `validOvertimeMinutes`, VP luôn 0.
- `Trừ khác`: cộng `otherDeductionMinutes`.

Cảnh báo VP:

- Nếu tổng đi trễ tháng của nhân viên VP vượt 180 phút, hệ thống ghi cảnh báo:

```text
Tổng đi trễ trong tháng vượt quá 3 tiếng, cần xem xét trừ lương
```

## 7.21 Sheet riêng từng nhân viên

Khi xuất file, hệ thống append sheet riêng cho từng nhân viên có dữ liệu.

Header sheet nhân viên:

```text
Ngày
Thứ
Vào 1
Ra 1
Vào 2
Ra 2
Đi sớm
Đi trễ
Về sớm
Tăng ca
Trừ khác
Ngày Công
Ghi chú
```

Đặc điểm:

- Sheet title: `BẢNG CHẤM CÔNG THÁNG mm/yyyy`.
- Có dòng `Nhân viên: <tên>`.
- Dữ liệu sắp xếp theo ngày.
- Ưu tiên hiển thị clock Shop nếu có; nếu không dùng clock đã điều chỉnh/gốc.
- Summary cuối sheet nhân viên lấy số liệu từ summary box nguồn để khớp 1:1.
- `Ngày Công` = 1 nếu là ngày làm trong tháng báo cáo, ngược lại 0.
- Nếu file có dữ liệu tháng trước, sheet nhân viên vẫn có dòng nhưng `Ngày Công` tháng trước là 0.
- Tên sheet được sanitize, tối đa 31 ký tự và tự thêm suffix nếu trùng.

## 8. API backend

## 8.1 Auth

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

## 8.2 Accounts

```text
GET    /api/accounts
POST   /api/accounts
PUT    /api/accounts/:id
POST   /api/accounts/:id/password
DELETE /api/accounts/:id
```

Tất cả route account yêu cầu Admin.

## 8.3 Employees

```text
GET    /api/employees
POST   /api/employees
PUT    /api/employees/:id
DELETE /api/employees/:id
POST   /api/employees/bulk
DELETE /api/employees/bulk
```

- `GET`: Admin xem toàn bộ, Manager xem theo chi nhánh.
- `POST/PUT`: Manager chỉ được tạo/sửa trong chi nhánh mình.
- `DELETE` và bulk delete: Admin only.
- `POST /bulk`: Admin replace/import toàn bộ.

## 8.4 Diary

```text
GET    /api/diary
POST   /api/diary
PUT    /api/diary/:id
DELETE /api/diary/:id
GET    /api/diary/export
POST   /api/diary/import
POST   /api/diary/bulk
DELETE /api/diary/bulk
```

Alias tương thích:

```text
/api/diary-entries
/api/diary-entries/export
/api/diary-entries/import
/api/diary-entries/bulk
```

Ghi chú quyền:

- `GET/POST/PUT`: yêu cầu login, service kiểm tra chi nhánh.
- `DELETE /api/diary/:id`: Admin only theo route.
- Import/export/bulk: Admin hoặc Manager, nhưng Manager bị giới hạn/ép branch.

## 8.5 Attachments

```text
GET    /api/attachments/config
GET    /api/attachments
POST   /api/attachments/:diaryEntryId
GET    /api/attachments/:id/content
DELETE /api/attachments/:id
DELETE /api/diary/:diaryEntryId/attachments
```

Ghi chú:

- Upload dùng multipart/form-data.
- Field upload chính: `file`.
- Có thể truyền `uploadedBy`, `branch`, `replaceAttachmentId`.
- `DELETE /api/diary/:diaryEntryId/attachments` yêu cầu Admin.

## 8.6 Audit

```text
POST /api/audit-logs
GET  /api/audit-logs
```

## 8.7 Health

```text
GET /api/health
```

## 9. Database schema

Migration chính: `migrations/001_init.sql`.

Bảng:

### 9.1 users

Lưu tài khoản đăng nhập.

Cột chính:

- `id`
- `username`
- `password_hash`
- `role`
- `full_name`
- `branch`
- `status`
- `created_by`
- `created_at`
- `updated_at`

Index:

- `idx_users_username`
- `idx_users_role_branch`

### 9.2 sessions

Lưu token hash đăng nhập.

Cột chính:

- `token_hash`
- `user_id`
- `created_at`
- `expires_at`

### 9.3 audit_logs

Lưu log thao tác.

Cột chính:

- `id`
- `user_id`
- `username`
- `role`
- `branch`
- `action`
- `target_type`
- `target_id`
- `detail`
- `created_at`

### 9.4 employees

Lưu danh sách nhân viên và giờ đăng ký.

Cột chính:

- `id`
- `branch`
- `employee_code`
- `employee_name`
- `registered_shift`
- `morning_in`
- `morning_out`
- `afternoon_in`
- `afternoon_out`
- `evening_in`
- `evening_out`
- `full_in`
- `full_out`
- `note`
- `payload`
- `created_at`
- `updated_at`

Unique index:

- `uq_employees_employee_code` nếu mã không rỗng.

### 9.5 diary_entries

Lưu Diary/Ghi chú.

Cột chính:

- `id`
- `branch`
- `weekday`
- `date`
- `employee_code`
- `employee_name`
- `reason`
- `permission`
- `creator_code`
- `creator_name`
- `violation_types`
- `payload`
- `created_at`
- `updated_at`

### 9.6 diary_attachments

Lưu metadata file đính kèm.

Cột chính:

- `id`
- `diary_entry_id`
- `file_name`
- `file_type`
- `file_size`
- `blob_url`
- `blob_pathname`
- `uploaded_by`
- `uploaded_by_account_id`
- `uploaded_by_username`
- `branch`
- `uploaded_date`
- `created_at`

### 9.7 shift_rules

Lưu rule ca nếu cần mở rộng.

Cột chính:

- `id`
- `name`
- `enabled`
- `priority`
- `conditions`
- `assigned_shift`
- `created_at`
- `updated_at`

## 10. Env cần cấu hình

Không commit file `.env`, `.env.local`, `.env.production.local`.

Env quan trọng:

```text
DATABASE_URL                 Bắt buộc khi chạy DB Postgres/Neon
DEFAULT_ADMIN_PASSWORD        Mật khẩu seed cho user admin
DEFAULT_MANAGER_PASSWORD      Mật khẩu seed cho user manager
DEFAULT_MANAGER_BRANCH        Chi nhánh manager mặc định, fallback Q7
SESSION_TTL_MS                Thời hạn session, mặc định 7 ngày
BLOB_READ_WRITE_TOKEN         Token Vercel Blob cho production attachment
ATTACHMENT_MAX_MB             Giới hạn upload MB, mặc định 20
TIMEKEEPING_DATA_DIR          Thư mục data local fallback
TIMEKEEPING_SQLITE_PATH       Đường dẫn SQLite cũ nếu migrate
TIMEKEEPING_LISTEN            Set 0 khi import app để test không listen port
PORT                          Port local, mặc định 5173
NODE_ENV                      production/test/development
VERCEL                        =1 khi chạy trên Vercel
DIARY_IMPORT_MAX_ROWS         Số dòng import Diary tối đa, mặc định 5000
DIARY_IMPORT_BATCH_SIZE       Batch import Diary, mặc định 300, min 200 max 500
VERIFY_SERVER_WITH_DATABASE   =1 để chạy verify-server với DB thật
```

Env Neon/Vercel có thể tự sinh thêm nhiều biến như `POSTGRES_URL`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `VERCEL_*`. Chỉ cần đảm bảo app có `DATABASE_URL` và các secret cần thiết.

## 11. Chạy local

## 11.1 Cài package

```bash
npm install
```

## 11.2 Chuẩn bị env local

Tạo file `.env.local` hoặc set env trong terminal. Không commit file này.

Ví dụ key cần có:

```env
DATABASE_URL=postgresql://...
DEFAULT_ADMIN_PASSWORD=...
DEFAULT_MANAGER_PASSWORD=...
DEFAULT_MANAGER_BRANCH=Q7
ATTACHMENT_MAX_MB=20
TIMEKEEPING_DATA_DIR=./data
```

## 11.3 Chạy migration

```bash
npm run db:migrate
```

## 11.4 Seed account mặc định

```bash
npm run db:seed
```

Seed tạo:

- `admin` nếu chưa có.
- `manager` nếu chưa có.

Mật khẩu lấy từ env, không ghi cứng trong code.

## 11.5 Chạy dev

```bash
npm run dev
```

Mặc định chạy tại:

```text
http://localhost:5173
```

Lệnh này chạy Express server, đồng thời register frontend dev/build theo cấu hình server.

## 11.6 Build production local

```bash
npm run build
npm start
```

Hoặc preview:

```bash
npm run preview
```

## 11.7 Verify

```bash
npm run verify
```

Lệnh này chạy nhiều file verify:

- Excel logic.
- Diary import.
- Employee selection/bulk delete.
- Server import/health/error.
- Server integration nếu có `VERIFY_SERVER_WITH_DATABASE=1` và `DATABASE_URL`.

## 12. Deploy Vercel + Neon

## 12.1 Vercel config hiện tại

File `vercel.json`:

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Rewrite `/api/:path*` về `/api`
- Rewrite SPA route về `/index.html`
- Function `api/index.mjs` maxDuration 60 giây

## 12.2 Các bước deploy lần đầu

1. Tạo project Vercel từ GitHub repo.
2. Tạo Neon Postgres qua Vercel Marketplace hoặc Neon dashboard.
3. Gắn `DATABASE_URL` vào Vercel Environment Variables.
4. Tạo các env secret:

```text
DEFAULT_ADMIN_PASSWORD
DEFAULT_MANAGER_PASSWORD
DEFAULT_MANAGER_BRANCH
SESSION_TTL_MS
BLOB_READ_WRITE_TOKEN
ATTACHMENT_MAX_MB
```

5. Pull env về local nếu cần:

```bash
vercel env pull .env.local
```

6. Chạy migration bằng môi trường có `DATABASE_URL`:

```bash
npm run db:migrate
```

7. Chạy seed:

```bash
npm run db:seed
```

8. Deploy production:

```bash
vercel --prod
```

## 12.3 Khi deploy code mới

```bash
git status
git add .
git commit -m "chore: update timeapp"
git push origin main
```

Nếu GitHub đã connect Vercel, Vercel sẽ tự build/deploy.

Nếu muốn deploy thủ công:

```bash
vercel --prod
```

## 13. Migrate SQLite cũ sang Postgres

Nếu có dữ liệu SQLite cũ:

1. Đảm bảo có `DATABASE_URL`.
2. Nếu file SQLite không nằm mặc định ở `data/timekeeping.sqlite`, set:

```bash
set TIMEKEEPING_SQLITE_PATH=C:\duong\dan\timekeeping.sqlite
```

PowerShell:

```powershell
$env:TIMEKEEPING_SQLITE_PATH="C:\duong\dan\timekeeping.sqlite"
```

3. Chạy:

```bash
npm run db:migrate:sqlite
```

Script chỉ copy/upsert sang Postgres, không xóa SQLite cũ.

## 14. Hướng dẫn sử dụng nhanh cho Admin

## 14.1 Đăng nhập

1. Mở website.
2. Đăng nhập bằng tài khoản Admin.
3. Nếu bị lỗi `Không thể kết nối máy chủ`, kiểm tra API/Vercel logs/env DB.

## 14.2 Tạo/check tài khoản Manager

1. Vào `Account`.
2. Bấm `Thêm tài khoản`.
3. Nhập username, tên, role `Manager`, chi nhánh.
4. Đặt password.
5. Lưu.
6. Nếu muốn khóa tài khoản, đổi status sang `Inactive`.

## 14.3 Import nhân viên

1. Vào `Nhân viên / Giờ ĐK`.
2. Bấm import.
3. Chọn file `RegisHours.xlsx`.
4. Kiểm tra danh sách sau import.
5. Dùng filter chi nhánh/nhóm/search để kiểm tra nhanh.

## 14.4 Tạo Diary

1. Vào `Diary / Ghi chú`.
2. Bấm thêm dòng Diary.
3. Chọn ngày.
4. Nhập mã hoặc tên nhân viên.
5. Nhập mốc Shop nếu cần chỉnh lại vào/ra.
6. Nhập ghi chú.
7. Chọn `Có phép` hoặc `Không phép`.
8. Tick loại ghi chú phù hợp.
9. Chọn người lập biên bản.
10. Đính kèm file nếu có.
11. Lưu.

## 14.5 Xử lý một file chấm công

1. Vào `Xử lý chấm công`.
2. Kiểm tra số nhân viên và số Diary đã load.
3. Upload file `.xlsx` có sheet `Chi tiết`.
4. Bấm `Xử lý file`.
5. Xem alert kết quả.
6. Xem preview.
7. Tải file Excel kết quả.
8. Mở file Excel kiểm tra sheet `Chi tiết`, summary box và sheet từng nhân viên.

## 14.6 Xử lý nhiều file

1. Vào `Xử lý`.
2. Upload nhiều file Excel.
3. Chọn chi nhánh/nhân viên/ngày nếu cần.
4. Chọn kiểu xuất:
   - Tổng hợp 1 file.
   - Từng file riêng.
5. Bấm xử lý.
6. Tải file tổng hợp hoặc tải từng file.
7. Nếu có sheet `Không tìm thấy`, kiểm tra các nhân viên được chọn nhưng không có dữ liệu.

## 15. Hướng dẫn sử dụng nhanh cho Manager

Manager chỉ thao tác trong chi nhánh được gán.

## 15.1 Quản lý nhân viên chi nhánh

1. Vào `Nhân viên / Giờ ĐK`.
2. Xem danh sách nhân viên thuộc chi nhánh.
3. Thêm hoặc sửa nhân viên nếu cần.
4. Không có quyền import/export/xóa nhân viên.

## 15.2 Quản lý Diary chi nhánh

1. Vào `Diary / Ghi chú`.
2. Thêm/sửa Diary cho nhân viên cùng chi nhánh.
3. Upload file đính kèm nếu có.
4. Có thể import/export Diary trong phạm vi quyền, backend sẽ ép branch về chi nhánh của Manager.
5. Chỉ được sửa/xóa file đính kèm do chính mình upload.

## 16. Quy trình backup source code lên GitHub

Mục tiêu: đưa `Backup.md` và `README.md` lên repo cùng source code, không đưa secret lên Git.

## 16.1 Kiểm tra trước khi commit

Chạy ở thư mục project local:

```powershell
cd C:\Users\Admin\Documents\TimeApp
git status
```

Kiểm tra `.gitignore` phải có các dòng này:

```gitignore
node_modules
dist
.vercel
.vite
.env
.env.local
.env.*.local
.env*
data/
uploads/
server/uploads/
local-data/
*.sqlite
*.sqlite3
*.db
```

Kiểm tra có file env nào đang bị Git track không:

```powershell
git ls-files .env* .vercel
```

Nếu lệnh trên có hiện `.env`, `.env.local`, `.env.production.local` hoặc `.vercel`, gỡ khỏi Git index ngay:

```powershell
git rm --cached .env .env.local .env.production.local -r .vercel
```

Nếu báo file không tồn tại thì bỏ qua.

## 16.2 Copy Backup.md vào project

Đặt file `Backup.md` ở root project, cùng cấp `README.md`, `package.json`, `vercel.json`.

Cấu trúc đúng:

```text
TimeApp/
  Backup.md
  README.md
  package.json
  vercel.json
  src/
  server/
  api/
  migrations/
  scripts/
```

## 16.3 Commit tài liệu backup cùng README.md

Nếu chỉ muốn commit tài liệu:

```powershell
git add Backup.md README.md .gitignore
git commit -m "docs: add project backup documentation"
git push origin main
```

Nếu `README.md` không thay đổi, Git sẽ tự bỏ qua file đó, không sao.

## 16.4 Commit toàn bộ code đang sửa cùng tài liệu

Nếu muốn backup cả code hiện tại lên GitHub:

```powershell
git status
git add api server src migrations scripts public package.json package-lock.json vercel.json vite.config.js README.md Backup.md .gitignore verify-*.mjs
git status
git commit -m "backup: save current TimeApp source"
git push origin main
```

Không dùng `git add .` nếu chưa chắc chắn `.env` và file upload/database không bị track.

## 16.5 Tạo branch backup riêng

Sau khi commit main, tạo thêm branch backup theo ngày:

```powershell
git checkout -b backup-2026-07-01
git push -u origin backup-2026-07-01
git checkout main
```

Sau bước này GitHub có:

- `main`: code chính.
- `backup-2026-07-01`: bản backup đóng băng theo ngày.

## 16.6 Tạo tag backup

Nếu muốn đánh dấu phiên bản:

```powershell
git tag backup-2026-07-01
git push origin backup-2026-07-01
```

## 16.7 Kiểm tra trên GitHub

Sau khi push:

1. Mở GitHub repo.
2. Kiểm tra có file `Backup.md` và `README.md` ở root.
3. Mở tab branch, kiểm tra branch `backup-2026-07-01` nếu đã tạo.
4. Mở Vercel, kiểm tra deployment mới nếu repo đang connect Vercel.
5. Nếu Vercel build fail, kiểm tra logs và env.

## 17. Quy trình backup database Neon

Source code backup chưa bao gồm dữ liệu production trong Neon. Cần backup DB riêng.

## 17.1 Backup bằng Neon dashboard

1. Vào Neon dashboard.
2. Chọn project/database đang dùng.
3. Kiểm tra mục Branches/Backups/Restore point.
4. Tạo branch/snapshot trước khi sửa lớn nếu cần.

## 17.2 Backup bằng pg_dump

Nếu máy có PostgreSQL client:

```bash
pg_dump "$DATABASE_URL" > timeapp_backup_2026-07-01.sql
```

Windows PowerShell:

```powershell
pg_dump $env:DATABASE_URL > timeapp_backup_2026-07-01.sql
```

Không commit file `.sql` nếu chứa dữ liệu thật hoặc thông tin nhạy cảm.

## 18. Quy trình backup file đính kèm

Nếu production dùng Vercel Blob:

- Metadata nằm trong Postgres bảng `diary_attachments`.
- File thật nằm trên Vercel Blob.
- Cần kiểm tra Vercel Blob dashboard để quản lý/download khi cần.

Nếu local dev dùng fallback local:

- File nằm trong thư mục:

```text
TIMEKEEPING_DATA_DIR/uploads
```

hoặc fallback:

```text
data/uploads
```

Không commit thư mục upload thật lên Git.

## 19. Checklist trước khi sửa lớn

Trước khi giao Codex/AI sửa code hoặc refactor:

```powershell
git status
npm run verify
npm run build
```

Sau đó backup:

```powershell
git add Backup.md README.md .gitignore api server src migrations scripts public package.json package-lock.json vercel.json vite.config.js verify-*.mjs
git commit -m "backup: before major changes"
git push origin main
git checkout -b backup-before-major-changes-2026-07-01
git push -u origin backup-before-major-changes-2026-07-01
git checkout main
```

Nếu app đang chạy production, nên backup DB Neon trước khi chạy migration hoặc thay đổi schema.

## 20. Các file không được commit

Tuyệt đối không commit:

```text
.env
.env.local
.env.production.local
.env.*.local
.vercel/
node_modules/
dist/
data/
uploads/
server/uploads/
local-data/
*.sqlite
*.sqlite3
*.db
*.sql backup DB thật nếu có dữ liệu nhạy cảm
```

Nếu lỡ commit secret:

1. Rotate secret ngay trên Vercel/Neon/Vercel Blob.
2. Gỡ file khỏi Git.
3. Tạo commit xóa.
4. Nếu secret đã lên GitHub public/private repo, vẫn nên xem như đã lộ.

## 21. Lệnh hay dùng

Cài dependency:

```bash
npm install
```

Migration:

```bash
npm run db:migrate
```

Seed:

```bash
npm run db:seed
```

Dev:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Start production local:

```bash
npm start
```

Verify:

```bash
npm run verify
```

Deploy production Vercel:

```bash
vercel --prod
```

Xem Git status:

```bash
git status
```

Commit docs:

```bash
git add Backup.md README.md .gitignore
git commit -m "docs: add backup guide"
git push origin main
```

Commit full backup:

```bash
git add api server src migrations scripts public package.json package-lock.json vercel.json vite.config.js README.md Backup.md .gitignore verify-*.mjs
git commit -m "backup: save current TimeApp source"
git push origin main
```

## 22. Ghi chú vận hành

- File gốc chấm công không bị mutate; hệ thống tạo workbook kết quả mới.
- Production không nên fallback local attachment; cần `BLOB_READ_WRITE_TOKEN`.
- Khi lỗi login production, kiểm tra `DATABASE_URL`, migration, seed và logs `/api/auth/login`.
- Khi lỗi `relation users does not exist`, cần chạy `npm run db:migrate` đúng database production.
- Khi Manager thấy sai chi nhánh, kiểm tra branch của account và cách hệ thống detect branch từ nhân viên/Diary.
- Khi file chấm công báo thiếu cột, kiểm tra sheet `Chi tiết`, header trong 50 dòng đầu và tên cột có đúng không.
- Khi tăng ca không vào tổng, kiểm tra Diary có tick `Tăng ca` và `Có phép` chưa.
- Khi đi trễ/về sớm bị đưa sang `Trừ khác`, kiểm tra Diary có tick `Khác` không.
- Khi VP không cộng tăng ca là đúng rule hiện tại.
- Khi file có dữ liệu tháng trước, `Tổng công` chỉ tính tháng mới nhất trong dữ liệu.
