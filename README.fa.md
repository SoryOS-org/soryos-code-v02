<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">ایجنت کدنویسی متن‌باز با هوش مصنوعی.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/@opencode/cli"><img alt="npm" src="https://img.shields.io/npm/v/@opencode/cli?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://github.com/anomalyco/opencode/actions/workflows/publish.yml/badge.svg?branch=dev" /></a>
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
  <a href="README.vi.md">Tiếng Việt</a> |
  <a href="README.fa.md">دری</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### نصب

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# مدیریت‌کننده‌های بسته
npm i -g @opencode/cli@latest      # یا bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS و Linux (پیشنهاد شده، همیشه به‌روز)
brew install opencode              # macOS و Linux (فورمول رسمی brew، کمتر به‌روز می‌شود)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (آخرین نسخه از AUR)
mise use -g opencode               # هر سیستم‌عاملی
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> پیش از نصب، نسخه‌های قدیمی‌تر از 0.1.x را حذف کنید.

### اپلیکیشن دسکتاپ (تجربی)

اوپن‌کد به شکل اپلیکیشن دسکتاپ هم موجود است. آن را از [opencode.ai/download](https://opencode.ai/download) دانلود کنید.

| پلتفرم                | دانلود                             |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`، `.rpm` یا `.AppImage`      |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### محل نصب

اسکریپت نصب برای مسیر نصب، ترتیب اولویت زیر را رعایت می‌کند:

1. `$OPENCODE_INSTALL_DIR` - محل نصب سفارشی
2. `$XDG_BIN_DIR` - مسیر مطابق با مشخصات XDG Base Directory
3. `$HOME/bin` - محل استندرد باینری یوزر (اگر موجود باشد یا بتوان ساختش)
4. `$HOME/.opencode/bin` - گزینه پیش‌فرض نهایی

```bash
# مثال‌ها
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/v2/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/v2/install | bash
```

### ایجنت‌ها

اوپن‌کد دو ایجنت داخلی دارد که می‌توانید با کلید `Tab` بین‌شان سوئیچ کنید.

- **build** - ایجنت پیش‌فرض با دسترسی کامل برای کارهای توسعه
- **plan** - ایجنت فقط‌خواندنی برای تحلیل و کاوش کد
  - به‌صورت پیش‌فرض اجازه ویرایش فایل را نمی‌دهد
  - پیش از اجرای commands بش از اجازه می‌پرسد
  - برای کاوش در کدبیس‌های ناآشنا یا پلان کردن تغییرات مناسب است

همچنین یک زیرایجنت **general** برای جستجوهای پیچیده و کارهای چندمرحله‌ای نیز شامل است.
این زیرایجنت به شکل داخلی استفاده می‌شود و می‌توان با `@general` در پیام‌ها آن را صدا زد.

بیشتر در مورد [ایجنت‌ها](https://opencode.ai/docs/agents) بدانید.

### مستندات

برای معلومات بیشتر در مورد تنظیم اوپن‌کد، [**به مستندات ما سر بزنید**](https://opencode.ai/docs).

### مشارکت

اگر علاقه‌مند به مشارکت در اوپن‌کد هستید، لطفا پیش از ارسال pull request [مستندات مشارکت](./CONTRIBUTING.md) ما را بخوانید.

### ساخت روی OpenCode

اگر روی پروژه‌ای کار می‌کنید که به اوپن‌کد مرتبط است و "opencode" را بخشی از نامش قرار داده — برای مثال "opencode-dashboard" یا "opencode-mobile" — لطفا در README خود یادداشتی اضافه کنید که روشن سازد آن پروژه توسط تیم اوپن‌کد ساخته نشده و به هیچ شکلی با ما وابستگی ندارد.

---

**به جامعه ما بپیوندید** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
