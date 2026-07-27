
```
▄████▄ ▄▄  ▄▄ ▄▄ ▄█████  ▄▄▄  ▄▄▄▄  ▄▄▄▄▄ 
██▄▄██ ███▄██ ██ ██     ██▀██ ██▀██ ██▄▄  
██  ██ ██ ▀██ ██ ▀█████ ▀███▀ ████▀ ██▄▄▄
```

<p align="center">The open source AI coding agent.</p>

<p align="center">
  <a href="https://github.com/minhmc2007/AniCode/discussions"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://github.com/minhmc2007/AniCode/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/minhmc2007/AniCode?style=flat-square" /></a>
  <a href="https://github.com/minhmc2007/AniCode/actions"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/minhmc2007/AniCode/typecheck.yml?style=flat-square&branch=dev" /></a>
</p>

---

### Installation

#### Method 1: GitHub Releases (Pre-built Binary)

Download the latest release from [GitHub Releases](https://github.com/minhmc2007/AniCode/releases):

```bash
# Linux x64
curl -LO https://github.com/minhmc2007/AniCode/releases/latest/download/anicode-linux-x64.tar.gz
tar -xzf anicode-linux-x64.tar.gz
sudo mv anicode /usr/local/bin/
```

#### Method 2: Arch Linux (PKGBUILD)

Build from the PKGBUILD in `dist/aur/`:

```bash
cd dist/aur/opencode-bin
makepkg -si
```

#### Method 3: Build from Source

```bash
git clone https://github.com/minhmc2007/AniCode.git
cd AniCode
pnpm install
pnpm build
```

### Feature Highlights

- **AniCli Theme:** Warm cream (`#FEEAC9`), peach (`#FFCDC9`), coral (`#FD7979`) palette.
- **Terminal Background Image Support:** Fastfetch-style image rendering in the TUI.
- **YouTube Music Engine:** Built-in MPV streaming, TUI `/music` menu, playlist engine, and AI natural language search (`anicode_search_music`).
- **Persistent Cross-Repo Memory:** Stored at `.anicode/memory.md` — survives session restarts.
- **Dandere AI Personality:** Soft-spoken, token-saving AI persona for efficient interaction.
- **Context Compaction Fix:** Verbatim user note preservation during context window management.

### Agents

AniCode includes two built-in agents you can switch between with the `Tab` key.

- **build** — Default, full-access agent for development work
- **plan** — Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

### Documentation

For more info on how to configure AniCode, [head over to our docs](https://opencode.ai/docs).

### Contributing

If you're interested in contributing to AniCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on AniCode

If you are working on a project that's related to AniCode and is using "anicode" as part of its name, for example "anicode-dashboard" or "anicode-mobile", please add a note to your README to clarify that it is not built by the AniCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
