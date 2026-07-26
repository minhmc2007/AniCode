import { Effect } from "effect"
import { OptimizedBuffer } from "@opentui/core"

const KITTY_END = "\x1b\\"
const ITERM2_START = "\x1b]1337;File="
const ITERM2_END = "\x07"

const CHUNK_SIZE = 4096

export type TerminalGraphicsSupport = "kitty" | "iterm2" | "sixel" | "none"

export function detectTerminalGraphicsSupport(): TerminalGraphicsSupport {
  if (process.env.KITTY_WINDOW_ID) return "kitty"
  if (process.env.TERM_PROGRAM === "iTerm.app") return "iterm2"
  if (process.env.TERM_PROGRAM === "WezTerm") return "iterm2"
  if (process.env.TERM?.includes("kitty")) return "kitty"
  if (process.env.TERM?.includes("sixel")) return "sixel"
  return "none"
}

function wrapSequence(sequence: string): string {
  if (process.env.TMUX || process.env.STY) {
    return `\x1bPtmux;\x1b${sequence}\x1b\\`
  }
  return sequence
}

function base64Encode(data: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!)
  }
  return btoa(binary)
}

function sendKittyImage(data: Uint8Array): void {
  const encoded = base64Encode(data)
  const total = encoded.length
  let sent = 0

  while (sent < total) {
    const chunk = encoded.slice(sent, sent + CHUNK_SIZE)
    const isLast = sent + CHUNK_SIZE >= total

    const params = sent === 0
      ? "a=T,f=100"
      : "a=T"

    const payload = `\x1b_G${params},m=${isLast ? 0 : 1};${chunk}${KITTY_END}`
    process.stdout.write(wrapSequence(payload))
    sent += CHUNK_SIZE
  }
}

function sendIterm2Image(data: Uint8Array): void {
  const encoded = base64Encode(data)
  const payload = `${ITERM2_START}inline=1:${encoded}${ITERM2_END}`
  process.stdout.write(wrapSequence(payload))
}

export function renderBackgroundImage(imagePath: string): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const support = detectTerminalGraphicsSupport()
    if (support === "none") return

    const file = Bun.file(imagePath)
    const exists = yield* Effect.promise(() => file.exists())
    if (!exists) return

    const data = yield* Effect.promise(() => file.bytes())

    yield* Effect.sync(() => {
      if (support === "kitty") {
        sendKittyImage(data)
      } else if (support === "iterm2") {
        sendIterm2Image(data)
      }
    })
  })
}

export function compositeBackgroundIntoBuffer(
  buffer: OptimizedBuffer,
  imagePath: string,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const file = Bun.file(imagePath)
    const exists = yield* Effect.promise(() => file.exists())
    if (!exists) return

    const data = yield* Effect.promise(() => file.bytes())
    if (data.length === 0) return

    const support = detectTerminalGraphicsSupport()
    if (support === "kitty") {
      yield* Effect.sync(() => sendKittyImage(data))
    } else if (support === "iterm2") {
      yield* Effect.sync(() => sendIterm2Image(data))
    }
  })
}
