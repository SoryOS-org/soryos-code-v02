<p align="center">
  <a href="https://lutungcode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="LutungCode logo">
    </picture>
  </a>
</p>
<p align="center">LutungCode je open source AI agent za programiranje.</p>
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

### Instalacija

```bash
# YOLO
./install --binary /path/to/lutungcode

# Package manageri
npm i -g @lutungcode/cli@latest      # ili bun/pnpm/yarn
# Homebrew packages are not published yet # macOS i Linux (preporučeno, uvijek ažurno)
brew install lutungcode              # macOS i Linux (zvanična brew formula, rjeđe se ažurira)
sudo pacman -S lutungcode            # Arch Linux (Stable)
paru -S lutungcode-beta              # Arch Linux (Latest from AUR)
mise use -g lutungcode               # Bilo koji OS
# Nix packages are not published yet  # Nix
```

> [!TIP]
> Ukloni verzije starije od 0.1.x prije instalacije.

### Desktop aplikacija (BETA)

LutungCode je dostupan i kao desktop aplikacija. Preuzmi je sa [lutungcode.ai/download](https://lutungcode.ai/download).

| Platforma             | Preuzimanje                        |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `lutungcode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `lutungcode-desktop-mac-x64.dmg`     |
| Windows               | `lutungcode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm`, ili AppImage       |

```bash
# macOS (Homebrew)
brew install --cask lutungcode-desktop
```

#### Instalacijski direktorij

Instalacijska skripta koristi sljedeći redoslijed prioriteta za putanju instalacije:

1. `$LUTUNGCODE_INSTALL_DIR` - Prilagođeni instalacijski direktorij
2. `$XDG_BIN_DIR` - Putanja usklađena sa XDG Base Directory specifikacijom
3. `$HOME/bin` - Standardni korisnički bin direktorij (ako postoji ili se može kreirati)
4. `$HOME/.lutungcode/bin` - Podrazumijevana rezervna lokacija

```bash
# Primjeri
LUTUNGCODE_INSTALL_DIR=/usr/local/bin ./install --binary /path/to/lutungcode
XDG_BIN_DIR=$HOME/.local/bin ./install --binary /path/to/lutungcode
```

### Agenti

LutungCode uključuje dva ugrađena agenta između kojih možeš prebacivati tasterom `Tab`.

- **build** - Podrazumijevani agent sa punim pristupom za razvoj
- **plan** - Agent samo za čitanje za analizu i istraživanje koda
  - Podrazumijevano zabranjuje izmjene datoteka
  - Traži dozvolu prije pokretanja bash komandi
  - Idealan za istraživanje nepoznatih codebase-ova ili planiranje izmjena

Uključen je i **general** pod-agent za složene pretrage i višekoračne zadatke.
Koristi se interno i može se pozvati pomoću `@general` u porukama.

Saznaj više o [agentima](https://lutungcode.ai/docs/agents).

### Dokumentacija

Za više informacija o konfiguraciji LutungCode-a, [**pogledaj dokumentaciju**](https://lutungcode.ai/docs).

### Doprinosi

Ako želiš doprinositi LutungCode-u, pročitaj [upute za doprinošenje](./CONTRIBUTING.md) prije slanja pull requesta.

### Gradnja na LutungCode-u

Ako radiš na projektu koji je povezan s LutungCode-om i koristi "lutungcode" kao dio naziva, npr. "lutungcode-dashboard" ili "lutungcode-mobile", dodaj napomenu u svoj README da projekat nije napravio LutungCode tim i da nije povezan s nama.

---

**Pridruži se našoj zajednici** [Discord](https://discord.gg/lutungcode) | [X.com](https://x.com/lutungcode)
