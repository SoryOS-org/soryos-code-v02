# Make LutungCode public

Ship a small public beta first: a GitHub release, an installer on a domain you own, and users bringing their own model provider keys. npm, Homebrew, hosted models, accounts, and automatic updates can wait.

## 1. Finish ownership and branding

- Replace the remaining OpenCode wordmarks and icons. The terminal home screen already spells LUTUNG CODE.
- Keep the upstream MIT license and copyright notices.
- Confirm you can use the name LutungCode.
- Publish the source at a repository you control, for example `github.com/rizkynindra/lutungcode`.

## 2. Point the product at your domain

[LUTUNG AI](https://lutung.ai.id/) stays the parent site. Give LutungCode its own paths:

| Purpose | URL |
| --- | --- |
| Product page | `https://lutung.ai.id/lutungcode` |
| Installer | `https://lutung.ai.id/lutungcode/install` |
| Binaries | `https://downloads.lutung.ai.id/lutungcode/` |
| Update API | `https://api.lutung.ai.id/lutungcode/update` |
| Model catalog, only if you host one | `https://api.lutung.ai.id/lutungcode/models` |

Fill the empty values in `packages/util/src/identity.ts`:

```ts
domain: "https://lutung.ai.id",
githubRepository: "rizkynindra/lutungcode",
updateBase: "https://api.lutung.ai.id/lutungcode/update",
installUrl: "https://lutung.ai.id/lutungcode/install",
```

Leave `modelsUrl` and `consoleUrl` empty until those services exist. Leave `containerRepository`, `homebrewFormula`, `aurPackage`, and `wingetId` empty until you own those listings.

`installUrl` must return the shell installer. `updateBase` must serve the update API the CLI expects. A homepage is not enough for either one.

## 3. Build the release binaries

Build for:

- macOS arm64 and x64
- Linux arm64 and x64, glibc and musl
- Windows x64

From the repository root:

```bash
bun run --cwd packages/cli build
```

Upload the archives to GitHub Releases or `https://downloads.lutung.ai.id/lutungcode/`. Publish a SHA-256 checksum for each file. Sign the artifacts when you can.

## 4. Publish the installer

Host the repo's `install` script at `https://lutung.ai.id/lutungcode/install`. It must download binaries only from a host you control.

A user then installs with:

```bash
curl -fsSL https://lutung.ai.id/lutungcode/install | bash
```

The script installs `lutungcode` into `~/.lutungcode/bin` and adds that directory to the shell config. The user opens a new terminal and runs `lutungcode`.

Try this on clean macOS and Linux machines, not from this development checkout.

Until `LUTUNGCODE_UPDATE_BASE` is set, the installer refuses to download. A local binary can still be installed with:

```bash
./install --binary /path/to/lutungcode
```

## 5. Add package managers later

These are optional for the first beta:

```bash
npm install -g @lutungcode/cli
brew install lutungcode
```

Before turning them on, own the listing:

- npm organization `@lutungcode`
- a Homebrew tap
- a WinGet package id
- an AUR package
- a container registry namespace

Do not publish under a name you do not control.

## 6. Let users bring their own models

For the first public version, each user connects a provider they already pay for:

- Anthropic
- OpenAI
- Google
- OpenRouter
- a local model

Do not turn on a LutungCode model catalog, Console, Go, or Zen until you run those services yourself.

## 7. Check the release

From the repository root:

```bash
bun run check
```

Then confirm:

- A fresh install creates only LutungCode paths, such as `~/.config/lutungcode` and `~/.local/share/lutungcode`.
- `lutungcode --version`, `lutungcode --help`, and shell completions work.
- The install does not produce `opencode` or `opencode2`.
- Upgrade does not call an OpenCode host when your update URL is unset.
- Uninstall works.
- Logs do not contain credentials.
- Every release file has a checksum.

## 8. Publish the public pages

Before announcing the beta, publish:

- an install guide
- a provider setup guide
- a privacy policy and terms
- a security contact
- the supported operating systems
- an issue tracker
- release notes
- a clear beta label

## First launch

The smallest safe public release is GitHub Releases, the installer on `https://lutung.ai.id/lutungcode/install`, and users' own provider keys.
