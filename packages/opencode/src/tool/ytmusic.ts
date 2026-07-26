import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { YtMusicPlayer } from "../service/ytmusic"

const SearchMusicParams = Schema.Struct({
  query: Schema.String,
})

export const SearchMusicTool = Tool.define(
  "anicode_search_music",
  Effect.gen(function* () {
    return {
      description: "Search YouTube/YT Music for a song to see available versions (original, remix, nightcore, live, etc.). Present the results to the user and ask which version they want before playing. Do NOT play a generic song name directly.",
      parameters: SearchMusicParams,
      execute: (params: Schema.Schema.Type<typeof SearchMusicParams>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "ytmusic",
            patterns: [params.query],
            always: ["*"],
            metadata: { action: "search", query: params.query },
          })
          const results = yield* Effect.tryPromise(() => YtMusicPlayer.search(params.query))
          if (!results.length) return { output: "No results found.", title: "Music Search", metadata: {} }
          const output = results
            .map((r, i) => `${i + 1}. ${r.title} — ${r.uploader} (${r.duration})\n   ${r.url}`)
            .join("\n")
          return { output, title: `Search: ${params.query}`, metadata: {} }
        }).pipe(Effect.orDie),
    }
  }),
)

const PlayMusicParams = Schema.Struct({
  target: Schema.String,
})

export const PlayMusicTool = Tool.define(
  "anicode_play_music",
  Effect.gen(function* () {
    return {
      description: "Play a specific YouTube URL or exact confirmed track name. Do NOT use this for generic song names — use anicode_search_music first, present the options to the user, and use this tool ONLY when the user confirms the version or you have the exact URL.",
      parameters: PlayMusicParams,
      execute: (params: Schema.Schema.Type<typeof PlayMusicParams>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "ytmusic",
            patterns: [params.target],
            always: ["*"],
            metadata: { action: "play", target: params.target },
          })
          yield* Effect.tryPromise(() =>
            YtMusicPlayer.play(params.target).catch(() => {}),
          )
          return { output: `Playing "${params.target}".`, title: "Playing Music", metadata: {} }
        }).pipe(Effect.orDie),
    }
  }),
)

const ControlMusicParams = Schema.Struct({
  action: Schema.Literals(["pause", "resume", "stop"]),
})

export const ControlMusicTool = Tool.define(
  "anicode_control_music",
  Effect.gen(function* () {
    return {
      description: "Control current music playback (pause, resume, stop).",
      parameters: ControlMusicParams,
      execute: (params: Schema.Schema.Type<typeof ControlMusicParams>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "ytmusic",
            patterns: [],
            always: ["*"],
            metadata: { action: params.action },
          })
          if (params.action === "pause") {
            yield* Effect.tryPromise(() => YtMusicPlayer.pause())
            return { output: "Paused.", title: "Music Paused", metadata: {} }
          }
          if (params.action === "resume") {
            yield* Effect.tryPromise(() => YtMusicPlayer.resume())
            return { output: "Resumed.", title: "Music Resumed", metadata: {} }
          }
          yield* Effect.sync(() => YtMusicPlayer.stop())
          return { output: "Stopped.", title: "Music Stopped", metadata: {} }
        }).pipe(Effect.orDie),
    }
  }),
)

export const YtMusicTool = Tool.define(
  "ytmusic",
  Effect.gen(function* () {
    return {
      description: "Check the status of the shared music player (what's playing, volume, position). For actually playing music use anicode_play_music.",
      parameters: Schema.Struct({}),
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "ytmusic",
            patterns: [],
            always: ["*"],
            metadata: { action: "status" },
          })
          const status = yield* Effect.tryPromise(() => YtMusicPlayer.refreshStatus())
          return {
            output: `State: ${status.state}\nTrack: ${status.title}\nVolume: ${status.volume}%`,
            title: `Music ${status.state}: ${status.title}`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
