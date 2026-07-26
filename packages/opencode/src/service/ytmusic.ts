import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync, unlinkSync } from "node:fs"
import { connect, type Socket } from "node:net"

export type PlayerStatus = {
  state: "stopped" | "playing" | "paused"
  title: string
  url: string
  volume: number
}

export type SearchResult = {
  title: string
  uploader: string
  duration: string
  url: string
}

export type PlaybackMode = "idle" | "single" | "playlist"

export type PlaybackState = {
  mode: PlaybackMode
  singleTrack: SearchResult | null
  singleLoopRemaining: number | "inf"
  playlistName: string | null
  playlistTracks: SearchResult[]
  playlistIndex: number
  playlistLoopEnabled: boolean
}

const IPC_PATH = "/tmp/anicode-mpv.sock"

function sendIpcCommand(command: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!existsSync(IPC_PATH)) return reject(new Error("Player not active"))

    const client: Socket = connect(IPC_PATH, () => {
      client.write(JSON.stringify({ command }) + "\n")
    })

    let buf = ""
    client.on("data", (data) => { buf += data.toString() })
    client.on("end", () => {
      try { resolve(JSON.parse(buf)) } catch { resolve(null) }
    })
    client.on("error", reject)
    setTimeout(() => { client.end(); resolve(null) }, 2000)
  })
}

export class YtMusicPlayer {
  private static process: ChildProcess | null = null
  private static ipcListener: Socket | null = null
  private static status: PlayerStatus = { state: "stopped", title: "", url: "", volume: 70 }
  private static playbackState: PlaybackState = {
    mode: "idle",
    singleTrack: null,
    singleLoopRemaining: "inf",
    playlistName: null,
    playlistTracks: [],
    playlistIndex: 0,
    playlistLoopEnabled: false,
  }

  static checkDeps(): "mpv" | "yt-dlp" | null {
    const hasMpv =
      existsSync("/usr/bin/mpv") || existsSync("/usr/local/bin/mpv") ||
      spawnSync("mpv", ["--version"], { stdio: "ignore" }).status === 0
    if (!hasMpv) return "mpv"

    const hasYtDlp =
      existsSync("/usr/bin/yt-dlp") || existsSync("/usr/local/bin/yt-dlp") ||
      spawnSync("yt-dlp", ["--version"], { stdio: "ignore" }).status === 0
    if (!hasYtDlp) return "yt-dlp"

    return null
  }

  static async search(query: string): Promise<SearchResult[]> {
    return new Promise((resolve) => {
      const proc = spawn("yt-dlp", ["--flat-playlist", "-j", `ytsearch15:${query}`], { stdio: ["ignore", "pipe", "ignore"] })
      let output = ""
      proc.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString() })
      proc.on("close", () => {
        try {
          const results: SearchResult[] = output.trim().split("\n").filter(Boolean).map((line) => {
            const d = JSON.parse(line)
            return {
              title: d.title || "Unknown Title",
              uploader: d.uploader || d.channel || "Unknown Channel",
              duration: d.duration_string || (d.duration ? `${Math.floor(d.duration / 60)}:${String(d.duration % 60).padStart(2, "0")}` : "Live"),
              url: d.url || `https://www.youtube.com/watch?v=${d.id}`,
            }
          })
          resolve(results)
        } catch { resolve([]) }
      })
      proc.on("error", () => resolve([]))
    })
  }

  private static async spawnMpv(target: string): Promise<void> {
    YtMusicPlayer.cleanupSocket()

    const proc = spawn("mpv", [
      "--no-video",
      "--vid=no",
      "--ytdl-format=bestaudio",
      "--no-terminal",
      `--input-ipc-server=${IPC_PATH}`,
      "--script-opts=ytdl_hook-ytdl_path=yt-dlp",
      target,
    ], { stdio: "ignore", detached: true })
    proc.unref()

    YtMusicPlayer.process = proc
    proc.on("exit", () => {
      YtMusicPlayer.process = null
      YtMusicPlayer.ipcListener = null
      if (!YtMusicPlayer.status.url) return
      YtMusicPlayer.status = { ...YtMusicPlayer.status, state: "stopped" }
      if (existsSync(IPC_PATH)) { try { unlinkSync(IPC_PATH) } catch {} }
    })
    proc.on("error", () => {
      YtMusicPlayer.process = null
      YtMusicPlayer.ipcListener = null
      YtMusicPlayer.status = { ...YtMusicPlayer.status, state: "stopped" }
    })

    // Wait for socket to exist, then attach persistent IPC listener
    await new Promise<void>((resolve) => {
      const check = () => {
        if (existsSync(IPC_PATH)) resolve()
        else setTimeout(check, 100)
      }
      setTimeout(check, 200)
    })

    await new Promise((r) => setTimeout(r, 300))

    YtMusicPlayer.attachIpcListener()
  }

  private static attachIpcListener(): void {
    YtMusicPlayer.ipcListener?.destroy()
    if (!existsSync(IPC_PATH)) return

    let buf = ""
    YtMusicPlayer.ipcListener = connect(IPC_PATH, () => {
      // Send observe command to receive end-file events
      YtMusicPlayer.ipcListener?.write(JSON.stringify({ command: ["observe_property", 1, "eof-reached"] }) + "\n")
    })

    YtMusicPlayer.ipcListener.on("data", (chunk: Buffer) => {
      buf += chunk.toString()
      const lines = buf.split("\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          if (event.event === "end-file") {
            YtMusicPlayer.handleTrackEnded()
          }
        } catch {}
      }
    })

    YtMusicPlayer.ipcListener.on("error", () => {
      YtMusicPlayer.ipcListener = null
    })

    YtMusicPlayer.ipcListener.on("close", () => {
      YtMusicPlayer.ipcListener = null
    })
  }

  private static async handleTrackEnded(): Promise<void> {
    if (YtMusicPlayer.playbackState.mode === "single") {
      const loop = YtMusicPlayer.playbackState.singleLoopRemaining
      if (loop === "inf" || (typeof loop === "number" && loop > 1)) {
        if (typeof loop === "number") {
          YtMusicPlayer.playbackState.singleLoopRemaining = loop - 1
        }
        const track = YtMusicPlayer.playbackState.singleTrack
        if (track) {
          YtMusicPlayer.status = { ...YtMusicPlayer.status, title: track.title }
          await YtMusicPlayer.spawnMpv(track.url)
        }
      } else {
        YtMusicPlayer.stopInternal()
      }
    } else if (YtMusicPlayer.playbackState.mode === "playlist") {
      const nextIdx = YtMusicPlayer.playbackState.playlistIndex + 1
      if (nextIdx < YtMusicPlayer.playbackState.playlistTracks.length) {
        YtMusicPlayer.playbackState.playlistIndex = nextIdx
        const track = YtMusicPlayer.playbackState.playlistTracks[nextIdx]
        YtMusicPlayer.status = { ...YtMusicPlayer.status, title: track.title, url: track.url }
        await YtMusicPlayer.spawnMpv(track.url)
      } else if (YtMusicPlayer.playbackState.playlistLoopEnabled && YtMusicPlayer.playbackState.playlistTracks.length > 0) {
        YtMusicPlayer.playbackState.playlistIndex = 0
        const track = YtMusicPlayer.playbackState.playlistTracks[0]
        YtMusicPlayer.status = { ...YtMusicPlayer.status, title: track.title, url: track.url }
        await YtMusicPlayer.spawnMpv(track.url)
      } else {
        YtMusicPlayer.stopInternal()
      }
    }
  }

  static async play(queryOrUrl: string, loopCount?: number | "inf"): Promise<void> {
    const dep = YtMusicPlayer.checkDeps()
    if (dep) throw new Error(`Missing dependency: "${dep}". Install via: sudo pacman -S mpv yt-dlp`)

    YtMusicPlayer.cleanup()

    const target = queryOrUrl.startsWith("http") ? queryOrUrl : `ytsearch1:${queryOrUrl}`

    YtMusicPlayer.playbackState = {
      mode: "single",
      singleTrack: { title: queryOrUrl, uploader: "", duration: "", url: queryOrUrl },
      singleLoopRemaining: loopCount ?? 1,
      playlistName: null,
      playlistTracks: [],
      playlistIndex: 0,
      playlistLoopEnabled: false,
    }

    YtMusicPlayer.status = { state: "playing", title: queryOrUrl, url: target, volume: YtMusicPlayer.status.volume }

    // Try to resolve title from search if not a direct URL
    if (!queryOrUrl.startsWith("http")) {
      try {
        const results = await YtMusicPlayer.search(queryOrUrl)
        const top = results[0]
        if (top) {
          YtMusicPlayer.playbackState.singleTrack = top
          YtMusicPlayer.status.title = top.title
        }
      } catch {}
    }

    await YtMusicPlayer.spawnMpv(target)
  }

  static async playPlaylist(name: string, tracks: SearchResult[], loopEnabled = false): Promise<void> {
    if (tracks.length === 0) throw new Error("Playlist is empty")

    const dep = YtMusicPlayer.checkDeps()
    if (dep) throw new Error(`Missing dependency: "${dep}". Install via: sudo pacman -S mpv yt-dlp`)

    YtMusicPlayer.cleanup()

    YtMusicPlayer.playbackState = {
      mode: "playlist",
      singleTrack: null,
      singleLoopRemaining: 1,
      playlistName: name,
      playlistTracks: tracks,
      playlistIndex: 0,
      playlistLoopEnabled: loopEnabled,
    }

    const first = tracks[0]
    YtMusicPlayer.status = { state: "playing", title: first.title, url: first.url, volume: YtMusicPlayer.status.volume }
    await YtMusicPlayer.spawnMpv(first.url)
  }

  static async nextTrack(): Promise<string | null> {
    if (YtMusicPlayer.playbackState.mode !== "playlist" || YtMusicPlayer.playbackState.playlistTracks.length === 0) {
      return null
    }

    const nextIdx = (YtMusicPlayer.playbackState.playlistIndex + 1) % YtMusicPlayer.playbackState.playlistTracks.length
    YtMusicPlayer.playbackState.playlistIndex = nextIdx
    const track = YtMusicPlayer.playbackState.playlistTracks[nextIdx]
    YtMusicPlayer.status = { ...YtMusicPlayer.status, title: track.title, url: track.url, state: "playing" }

    // Kill current mpv to trigger next
    if (YtMusicPlayer.process) {
      try { YtMusicPlayer.process.kill("SIGTERM") } catch {}
      // Wait a moment then spawn the new one
      await new Promise((r) => setTimeout(r, 200))
    }

    await YtMusicPlayer.spawnMpv(track.url)
    return track.title
  }

  static setLoopCount(count: number | "inf"): void {
    if (YtMusicPlayer.playbackState.mode === "single") {
      YtMusicPlayer.playbackState.singleLoopRemaining = count
    }
  }

  static setPlaylistLoop(enabled: boolean): void {
    YtMusicPlayer.playbackState.playlistLoopEnabled = enabled
  }

  static getPlaybackState(): Readonly<PlaybackState> {
    return { ...YtMusicPlayer.playbackState }
  }

  static async pause(): Promise<void> {
    try {
      await sendIpcCommand(["set_property", "pause", true])
      YtMusicPlayer.status = { ...YtMusicPlayer.status, state: "paused" }
    } catch {}
  }

  static async resume(): Promise<void> {
    try {
      await sendIpcCommand(["set_property", "pause", false])
      YtMusicPlayer.status = { ...YtMusicPlayer.status, state: "playing" }
    } catch {}
  }

  static async setVolume(level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, level))
    YtMusicPlayer.status = { ...YtMusicPlayer.status, volume: clamped }
    try { await sendIpcCommand(["set_property", "volume", clamped]) } catch {}
  }

  static async getMediaTitle(): Promise<string> {
    try {
      const res = await sendIpcCommand(["get_property", "media-title"])
      if (res && typeof res === "object" && "data" in res) return String((res as { data: unknown }).data)
    } catch {}
    return YtMusicPlayer.status.title
  }

  static async refreshStatus(): Promise<PlayerStatus> {
    if (!YtMusicPlayer.process || YtMusicPlayer.status.state === "stopped") return YtMusicPlayer.getStatus()

    try {
      const [titleRes, volRes, pauseRes] = await Promise.allSettled([
        sendIpcCommand(["get_property", "media-title"]),
        sendIpcCommand(["get_property", "volume"]),
        sendIpcCommand(["get_property", "pause"]),
      ])

      if (titleRes.status === "fulfilled" && titleRes.value && typeof titleRes.value === "object" && "data" in titleRes.value) {
        YtMusicPlayer.status.title = String((titleRes.value as { data: unknown }).data)
      }
      if (volRes.status === "fulfilled" && volRes.value && typeof volRes.value === "object" && "data" in volRes.value) {
        YtMusicPlayer.status.volume = Number((volRes.value as { data: unknown }).data)
      }
      if (pauseRes.status === "fulfilled" && pauseRes.value && typeof pauseRes.value === "object" && "data" in pauseRes.value) {
        YtMusicPlayer.status.state = (pauseRes.value as { data: unknown }).data ? "paused" : "playing"
      }
    } catch {}

    return YtMusicPlayer.getStatus()
  }

  static getStatus(): PlayerStatus {
    return { ...YtMusicPlayer.status }
  }

  private static stopInternal(): void {
    YtMusicPlayer.cleanup()
    YtMusicPlayer.playbackState = {
      mode: "idle", singleTrack: null, singleLoopRemaining: "inf",
      playlistName: null, playlistTracks: [], playlistIndex: 0, playlistLoopEnabled: false,
    }
  }

  private static cleanupSocket(): void {
    YtMusicPlayer.ipcListener?.destroy()
    YtMusicPlayer.ipcListener = null
    if (existsSync(IPC_PATH)) { try { unlinkSync(IPC_PATH) } catch {} }
  }

  static stop(): void {
    YtMusicPlayer.cleanup()
  }

  static cleanup(): void {
    if (YtMusicPlayer.process) {
      try { YtMusicPlayer.process.kill("SIGTERM") } catch {}
      YtMusicPlayer.process = null
    }
    YtMusicPlayer.cleanupSocket()
    YtMusicPlayer.status = { state: "stopped", title: "", url: "", volume: YtMusicPlayer.status.volume }
  }
}
