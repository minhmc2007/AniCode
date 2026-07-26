import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { spawn } from "node:child_process"
import net from "node:net"

interface TrackInfo {
  id: string
  title: string
  artist: string
  duration?: number
}

interface PlayerState {
  pid: number
  socketPath: string
  track: TrackInfo | null
  volume: number
  startedAt: number
}

const players = new Map<string, PlayerState>()

const DEFAULT_INVIDIOUS_INSTANCE = "https://inv.nadeko.net"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["search", "play", "pause", "resume", "set_volume", "status"]).annotate({
    description: "Action to perform: search, play, pause, resume, set_volume, status",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search query (required for search action)",
  }),
  type: Schema.optional(Schema.Literals(["track", "playlist", "album"])).annotate({
    description: "Type of content to search for (search action)",
  }),
  id: Schema.optional(Schema.String).annotate({
    description: "YouTube video ID to play (required for play action if url not provided)",
  }),
  url: Schema.optional(Schema.String).annotate({
    description: "Full YouTube URL to play (alternative to id)",
  }),
  level: Schema.optional(Schema.Number).annotate({
    description: "Volume level 0-100 (required for set_volume action)",
  }),
})

function searchVideos(query: string, type: string | undefined) {
  const params = new URLSearchParams({ q: query })
  if (type) params.set("type", type)
  return fetch(`${DEFAULT_INVIDIOUS_INSTANCE}/api/v1/search?${params}`, {
    headers: { "User-Agent": "AniCode/1.0" },
  })
}

function formatSearchResults(data: unknown, type: string | undefined): string {
  if (!Array.isArray(data)) return "No results found."
  const filtered = type
    ? data.filter((item: any) => item.type === type || (type === "track" && item.type === "video"))
    : data
  if (filtered.length === 0) return "No results found."
  return filtered
    .slice(0, 10)
    .map((item: any, i: number) => {
      const title = item.title ?? "Unknown"
      const author = item.author ?? item.uploader ?? "Unknown"
      const id = item.videoId ?? ""
      const dur = item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${String(item.lengthSeconds % 60).padStart(2, "0")}` : "?:??"
      return `${i + 1}. "${title}" by ${author} (${dur}) [${id}]`
    })
    .join("\n")
}

function mpvCommand(socketPath: string, command: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath)
    const chunks: Buffer[] = []
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        client.destroy()
        reject(new Error("mpv IPC timeout"))
      }
    }, 5000)
    client.on("data", (chunk) => chunks.push(chunk))
    client.on("error", (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })
    client.on("connect", () => {
      client.write(JSON.stringify(command) + "\n")
    })
    client.on("end", () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        try {
          const raw = Buffer.concat(chunks).toString().trim()
          resolve(raw ? JSON.parse(raw) : null)
        } catch (e) {
          reject(e)
        }
      }
    })
  })
}

function spawnMpvPlayer(sessionID: string, url: string, volume: number): Promise<PlayerState> {
  return new Promise((resolve, reject) => {
    const socketPath = `/tmp/mpv-ytmusic-${sessionID}.sock`
    const proc = spawn(
      "mpv",
      [
        `--volume=${volume}`,
        `--input-ipc-server=${socketPath}`,
        "--no-video",
        "--ytdl-format=bestaudio",
        url,
      ],
      {
        stdio: "ignore",
        detached: true,
      },
    )
    proc.on("error", (err) => reject(err))
    proc.unref()
    setTimeout(() => {
      resolve({
        pid: proc.pid!,
        socketPath,
        track: null,
        volume,
        startedAt: Date.now(),
      })
    }, 1000)
  })
}

function parseYtId(input: string): string {
  if (!input) return ""
  const u = input.trim()
  const urlMatch = u.match(/[?&]v=([^&]+)/)
  if (urlMatch) return urlMatch[1]
  const shortMatch = u.match(/youtu\.be\/([^?&]+)/)
  if (shortMatch) return shortMatch[1]
  if (/^[\w-]{11}$/.test(u)) return u
  return u
}

function getPlayer(sessionID: string): PlayerState | undefined {
  return players.get(sessionID)
}

function setPlayer(sessionID: string, state: PlayerState) {
  players.set(sessionID, state)
}

export const YtMusicTool = Tool.define(
  "ytmusic",
  Effect.gen(function* () {
    return {
      description: [
        "YouTube Music control tool. Search for tracks, play audio, control playback, and get status.",
        "",
        "Actions:",
        "- search: Search YouTube Music for tracks/playlists/albums",
        "- play: Play a track by ID or URL using mpv (audio only)",
        "- pause: Pause current playback",
        "- resume: Resume paused playback",
        "- set_volume: Set volume level (0-100)",
        "- status: Get current playback state and track info",
      ].join("\n"),
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = ctx.sessionID

          switch (params.action) {
            case "search": {
              if (!params.query) throw new Error("query parameter is required for search action")
              yield* ctx.ask({
                permission: "ytmusic",
                patterns: [params.query],
                always: ["*"],
                metadata: { action: "search", query: params.query, type: params.type },
              })
              const res = yield* Effect.tryPromise({
                try: () => searchVideos(params.query!, params.type),
                catch: (err) => err,
              })
              const data = yield* Effect.tryPromise({
                try: () => res.json(),
                catch: (err) => err,
              })
              const output = formatSearchResults(data, params.type)
              return { output, title: `YouTube Music Search: ${params.query}`, metadata: {} }
            }

            case "play": {
              const vid = params.id ?? parseYtId(params.url ?? "")
              if (!vid) throw new Error("id or url parameter is required for play action")
              const url = `https://www.youtube.com/watch?v=${vid}`
              yield* ctx.ask({
                permission: "ytmusic",
                patterns: [url],
                always: ["*"],
                metadata: { action: "play", id: vid, url },
              })
              const existing = getPlayer(sessionID)
              if (existing) {
                try {
                  process.kill(existing.pid, "SIGKILL")
                } catch { /* already dead */ }
                players.delete(sessionID)
              }
              const state = yield* Effect.tryPromise({
                try: () => spawnMpvPlayer(sessionID, url, 50),
                catch: (err) => err,
              })
              state.track = { id: vid, title: "Unknown", artist: "Unknown" }
              setPlayer(sessionID, state)
              return { output: `Playing: ${url}\nPlayer PID: ${state.pid}`, title: `Playing YouTube Music: ${vid}`, metadata: {} }
            }

            case "pause": {
              const player = getPlayer(sessionID)
              if (!player) throw new Error("No active player for this session")
              yield* ctx.ask({
                permission: "ytmusic",
                patterns: [],
                always: ["*"],
                metadata: { action: "pause" },
              })
              try {
                process.kill(player.pid, "SIGSTOP")
              } catch {
                throw new Error("Failed to pause player (process may have exceeded)")
              }
              return { output: "Playback paused", title: "YouTube Music Paused", metadata: {} }
            }

            case "resume": {
              const player = getPlayer(sessionID)
              if (!player) throw new Error("No active player for this session")
              yield* ctx.ask({
                permission: "ytmusic",
                patterns: [],
                always: ["*"],
                metadata: { action: "resume" },
              })
              try {
                process.kill(player.pid, "SIGCONT")
              } catch {
                throw new Error("Failed to resume player (process may have exceeded)")
              }
              return { output: "Playback resumed", title: "YouTube Music Resumed", metadata: {} }
            }

            case "set_volume": {
              if (params.level === undefined) throw new Error("level parameter is required for set_volume action")
              if (params.level < 0 || params.level > 100) throw new Error("Volume level must be between 0 and 100")
              const player = getPlayer(sessionID)
              if (!player) throw new Error("No active player for this session")
              yield* ctx.ask({
                permission: "ytmusic",
                patterns: [],
                always: ["*"],
                metadata: { action: "set_volume", level: params.level },
              })
              yield* Effect.tryPromise({
                try: () => mpvCommand(player.socketPath, { command: ["set_property", "volume", params.level] }),
                catch: (err) => err,
              })
              player.volume = params.level
              return { output: `Volume set to ${params.level}`, title: `Volume: ${params.level}`, metadata: {} }
            }

            case "status": {
              const player = getPlayer(sessionID)
              yield* ctx.ask({
                permission: "ytmusic",
                patterns: [],
                always: ["*"],
                metadata: { action: "status" },
              })
              if (!player) {
                return { output: "No active playback", title: "YouTube Music Status", metadata: {} }
              }
              const alive = yield* Effect.sync(() => {
                try {
                  return process.kill(player.pid, 0)
                } catch {
                  return false
                }
              })
              if (!alive) {
                players.delete(sessionID)
                return { output: "Player process has exited", title: "YouTube Music Status", metadata: {} }
              }
              let volume = player.volume
              let pos = "?"
              let paused = false
              try {
                const volResult = yield* Effect.tryPromise({
                  try: () => mpvCommand(player.socketPath, { command: ["get_property", "volume"] }),
                  catch: (err) => err,
                })
                if (volResult && typeof volResult === "object" && "data" in volResult) {
                  volume = volResult.data as number
                }
                const posResult = yield* Effect.tryPromise({
                  try: () => mpvCommand(player.socketPath, { command: ["get_property", "time-pos"] }),
                  catch: (err) => err,
                })
                if (posResult && typeof posResult === "object" && "data" in posResult) {
                  const secs = Math.floor(posResult.data as number)
                  pos = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
                }
                const pauseResult = yield* Effect.tryPromise({
                  try: () => mpvCommand(player.socketPath, { command: ["get_property", "pause"] }),
                  catch: (err) => err,
                })
                if (pauseResult && typeof pauseResult === "object" && "data" in pauseResult) {
                  paused = pauseResult.data as boolean
                }
              } catch { /* IPC not available or failed */ }
              const state = paused ? "Paused" : "Playing"
              const trackTitle = player.track?.title ?? "Unknown"
              const trackArtist = player.track?.artist ?? "Unknown"
              const elapsed = Math.floor((Date.now() - player.startedAt) / 1000)
              const elapsedStr = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
              const output = [
                `State: ${state}`,
                `Track: ${trackTitle}`,
                `Artist: ${trackArtist}`,
                `Volume: ${volume}%`,
                `Position: ${pos}`,
                `Elapsed: ${elapsedStr}`,
                `PID: ${player.pid}`,
                `Started: ${new Date(player.startedAt).toLocaleTimeString()}`,
              ].join("\n")
              return { output, title: `YouTube Music ${state}: ${trackTitle}`, metadata: {} }
            }

            default:
              throw new Error(`Unknown action: ${(params as any).action}`)
          }
        }).pipe(Effect.orDie),
    }
  }),
)
