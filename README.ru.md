<p align="center">
  <a href="https://lutungcode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="LutungCode logo">
    </picture>
  </a>
</p>
<p align="center">Открытый AI-агент для программирования.</p>
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

### Установка

```bash
# YOLO
./install --binary /path/to/lutungcode

# Менеджеры пакетов
npm i -g @lutungcode/cli@latest      # или bun/pnpm/yarn
# Homebrew packages are not published yet # macOS и Linux (рекомендуем, всегда актуально)
brew install lutungcode              # macOS и Linux (официальная формула brew, обновляется реже)
sudo pacman -S lutungcode            # Arch Linux (Stable)
paru -S lutungcode-beta              # Arch Linux (Latest from AUR)
mise use -g lutungcode               # любая ОС
# Nix packages are not published yet  # Nix
```

> [!TIP]
> Перед установкой удалите версии старше 0.1.x.

### Десктопное приложение (BETA)

LutungCode также доступен как десктопное приложение. Скачайте его с [lutungcode.ai/download](https://lutungcode.ai/download).

| Платформа             | Загрузка                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `lutungcode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `lutungcode-desktop-mac-x64.dmg`     |
| Windows               | `lutungcode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm` или AppImage        |

```bash
# macOS (Homebrew)
brew install --cask lutungcode-desktop
```

#### Каталог установки

Скрипт установки выбирает путь установки в следующем порядке приоритета:

1. `$LUTUNGCODE_INSTALL_DIR` - Пользовательский каталог установки
2. `$XDG_BIN_DIR` - Путь, совместимый со спецификацией XDG Base Directory
3. `$HOME/bin` - Стандартный каталог пользовательских бинарников (если существует или можно создать)
4. `$HOME/.lutungcode/bin` - Fallback по умолчанию

```bash
# Примеры
LUTUNGCODE_INSTALL_DIR=/usr/local/bin ./install --binary /path/to/lutungcode
XDG_BIN_DIR=$HOME/.local/bin ./install --binary /path/to/lutungcode
```

### Agents

В LutungCode есть два встроенных агента, между которыми можно переключаться клавишей `Tab`.

- **build** - По умолчанию, агент с полным доступом для разработки
- **plan** - Агент только для чтения для анализа и изучения кода
  - По умолчанию запрещает редактирование файлов
  - Запрашивает разрешение перед выполнением bash-команд
  - Идеален для изучения незнакомых кодовых баз или планирования изменений

Также включен сабагент **general** для сложных поисков и многошаговых задач.
Он используется внутренне и может быть вызван в сообщениях через `@general`.

Подробнее об [agents](https://lutungcode.ai/docs/agents).

### Документация

Больше информации о том, как настроить LutungCode: [**наши docs**](https://lutungcode.ai/docs).

### Вклад

Если вы хотите внести вклад в LutungCode, прочитайте [contributing docs](./CONTRIBUTING.md) перед тем, как отправлять pull request.

### Разработка на базе LutungCode

Если вы делаете проект, связанный с LutungCode, и используете "lutungcode" как часть имени (например, "lutungcode-dashboard" или "lutungcode-mobile"), добавьте примечание в README, чтобы уточнить, что проект не создан командой LutungCode и не аффилирован с нами.

---

**Присоединяйтесь к нашему сообществу** [Discord](https://discord.gg/lutungcode) | [X.com](https://x.com/lutungcode)
