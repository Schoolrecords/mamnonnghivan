# Hệ thống Hồ sơ số Mầm non

Hệ thống quản lý hồ sơ số toàn diện cho trường mầm non Việt Nam, tích hợp module Tự đánh giá phục vụ Kiểm định chất lượng giáo dục theo Thông tư 22/2024/TT-BGDĐT.

## Tính năng chính

- **Hồ sơ số**: Quản lý 77 đầu mục hồ sơ trường học, liên kết với Google Drive theo cấu trúc khoa học
- **Đội ngũ**: Quản lý danh sách CB-GV-NV, tải lên từ Excel
- **Quản lý trẻ**: Phân nhóm tự động theo độ tuổi (Nhà trẻ / 3 / 4 / 5 tuổi)
- **Bảng minh chứng KĐCL**: Đồng bộ tự động với danh mục hồ sơ Drive
- **Tự đánh giá KĐCL**: 5 Tiêu chuẩn × 22 Tiêu chí × 4 Mức theo TT 22/2024
- **AI hỗ trợ**: Tích hợp Gemini/Claude để gợi ý nội dung báo cáo

## Cấu trúc dự án

```
├── index.html      Trang chính (chứa const API_URL riêng cho từng trường)
├── style.css       Định dạng giao diện (chung cho mọi trường)
├── app.js          Logic xử lý (chung cho mọi trường)
└── README.md       Tài liệu này
```

## Triển khai cho trường mới

1. Clone repository hoặc tải về 3 file
2. Tạo Google Sheet riêng cho trường + cài Apps Script backend
3. Triển khai Apps Script Web App → copy URL `/exec`
4. Mở `index.html` → tìm dòng `const API_URL = '...'` → thay bằng URL mới
5. Upload 3 file lên hosting (GitHub Pages, Netlify, hoặc bất kỳ static host nào)
6. Truy cập URL → đăng nhập admin với mật khẩu mặc định `admin@2026` → đổi mật khẩu ngay

## Cơ sở pháp lý

- Thông tư 52/2020/TT-BGDĐT — Điều lệ trường mầm non
- Thông tư 19/2018/TT-BGDĐT — Quy định KĐCL trường mầm non
- Thông tư 22/2024/TT-BGDĐT — Sửa đổi, bổ sung TT 19/2018
- Nghị định 30/2020/NĐ-CP — Công tác văn thư

## Phiên bản

Phiên bản hiện tại: **2026.06**

Xem chi tiết các phiên bản trong tài liệu hướng dẫn sử dụng đính kèm.

## Tác giả

Chung Trần — Trường Tiểu học Diễn Liên, xã Quảng Châu, tỉnh Nghệ An.

## Bản quyền

Mọi trường mầm non, tiểu học có thể sử dụng miễn phí. Khuyến nghị giữ nguyên thông tin tác giả khi triển khai.
