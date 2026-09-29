#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Đang khởi động Selection Translator tại http://localhost:8080 ..."
echo "👉 Mở trình duyệt và truy cập: http://localhost:8080"
echo "👉 Nhấn Ctrl+C để dừng máy chủ."
php -S localhost:8080
