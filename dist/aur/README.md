# AniCode AUR Package

This directory contains Arch Linux AUR package files for `anicode-git`.

## Building from this PKGBUILD

```bash
cd dist/aur
makepkg -si
```

## Dependencies

- `nodejs>=18` - JavaScript runtime
- `bun-bin` - Fast Bun runtime (from AUR)
- `pnpm` - Package manager
- `zig` - Build toolchain
- `mpv` + `yt-dlp` - YouTube Music playback
- `python` + `python-pip` - Build scripts

## Optional Dependencies

- `chafa` - Terminal image rendering
- `kitty-terminal` - Enhanced graphics protocol support

## Configuration

After installation, run `anicode` to start. Config is at `~/.config/anicode/anicode.json`.
