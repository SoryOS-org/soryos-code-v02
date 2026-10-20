<p align="center">
  <a href="https://lutungcode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="LutungCode logo">
    </picture>
  </a>
</p>
<p align="center">Trợ lý lập trình AI mã nguồn mở.</p>
<p align="center">
  <a href="https://lutungcode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/@lutungcode/cli"><img alt="npm" src="https://img.shields.io/npm/v/@lutungcode/cli?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/lutungcode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/lutungcode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![LutungCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://lutungcode.ai)

---

### Cài đặt

```bash
# YOLO
./install --binary /path/to/lutungcode

# Các trình quản lý gói (Package managers)
npm i -g @lutungcode/cli@latest      # hoặc bun/pnpm/yarn
# Homebrew packages are not published yet # macOS và Linux (khuyên dùng, luôn cập nhật)
brew install lutungcode              # macOS và Linux (công thức brew chính thức, ít cập nhật hơn)
sudo pacman -S lutungcode            # Arch Linux (Bản ổn định)
paru -S lutungcode-beta              # Arch Linux (Bản mới nhất từ AUR)
mise use -g lutungcode               # Mọi hệ điều hành
# Nix packages are not published yet  # Nix
```

> [!TIP]
> Hãy xóa các phiên bản cũ hơn 0.1.x trước khi cài đặt.

### Ứng dụng Desktop (BETA)

LutungCode cũng có sẵn dưới dạng ứng dụng desktop. Tải từ [lutungcode.ai/download](https://lutungcode.ai/download).

| Nền tảng              | Tải xuống                          |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `lutungcode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `lutungcode-desktop-mac-x64.dmg`     |
| Windows               | `lutungcode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm`, hoặc AppImage      |

```bash
# macOS (Homebrew)
brew install --cask lutungcode-desktop
```

#### Thư mục cài đặt

Tập lệnh cài đặt tuân theo thứ tự ưu tiên sau cho đường dẫn cài đặt:

1. `$LUTUNGCODE_INSTALL_DIR` - Thư mục cài đặt tùy chỉnh
2. `$XDG_BIN_DIR` - Đường dẫn tuân thủ XDG Base Directory Specification
3. `$HOME/bin` - Thư mục nhị phân tiêu chuẩn của người dùng (nếu tồn tại hoặc có thể tạo)
4. `$HOME/.lutungcode/bin` - Mặc định dự phòng

```bash
# Ví dụ
LUTUNGCODE_INSTALL_DIR=/usr/local/bin ./install --binary /path/to/lutungcode
XDG_BIN_DIR=$HOME/.local/bin ./install --binary /path/to/lutungcode
```

### Agents (Đại diện)

LutungCode bao gồm hai agent được tích hợp sẵn mà bạn có thể chuyển đổi bằng phím `Tab`.

- **build** - Agent mặc định, có toàn quyền truy cập cho công việc lập trình
- **plan** - Agent chỉ đọc dùng để phân tích và khám phá mã nguồn
  - Mặc định từ chối việc chỉnh sửa tệp
  - Hỏi quyền trước khi chạy các lệnh bash
  - Lý tưởng để khám phá các codebase lạ hoặc lên kế hoạch thay đổi

Ngoài ra còn có một subagent **general** dùng cho các tìm kiếm phức tạp và tác vụ nhiều bước.
Agent này được sử dụng nội bộ và có thể gọi bằng cách dùng `@general` trong tin nhắn.

Tìm hiểu thêm về [agents](https://lutungcode.ai/docs/agents).

### Tài liệu

Để biết thêm thông tin về cách cấu hình LutungCode, [**hãy truy cập tài liệu của chúng tôi**](https://lutungcode.ai/docs).

### Đóng góp

Nếu bạn muốn đóng góp cho LutungCode, vui lòng đọc [tài liệu hướng dẫn đóng góp](./CONTRIBUTING.md) trước khi gửi pull request.

### Xây dựng trên nền tảng LutungCode

Nếu bạn đang làm việc trên một dự án liên quan đến LutungCode và sử dụng "lutungcode" như một phần của tên dự án, ví dụ "lutungcode-dashboard" hoặc "lutungcode-mobile", vui lòng thêm một ghi chú vào README của bạn để làm rõ rằng dự án đó không được xây dựng bởi đội ngũ LutungCode và không liên kết với chúng tôi dưới bất kỳ hình thức nào.

---

**Tham gia cộng đồng của chúng tôi** [Discord](https://discord.gg/lutungcode) | [X.com](https://x.com/lutungcode)
