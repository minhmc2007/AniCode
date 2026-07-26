import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { SearchResult } from "./ytmusic"

const CONFIG_DIR = join(homedir(), ".config", "anicode")
const PLAYLIST_FILE = join(CONFIG_DIR, "playlists.json")

export interface PlaylistMap {
  [name: string]: SearchResult[]
}

export class PlaylistManager {
  private static ensureStore(): PlaylistMap {
    try {
      if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
      if (!existsSync(PLAYLIST_FILE)) {
        const initial: PlaylistMap = { Favorites: [] }
        writeFileSync(PLAYLIST_FILE, JSON.stringify(initial, null, 2))
        return initial
      }
      return JSON.parse(readFileSync(PLAYLIST_FILE, "utf-8"))
    } catch {
      return { Favorites: [] }
    }
  }

  private static save(store: PlaylistMap) {
    writeFileSync(PLAYLIST_FILE, JSON.stringify(store, null, 2))
  }

  static getPlaylists(): PlaylistMap {
    return this.ensureStore()
  }

  static getNames(): string[] {
    return Object.keys(this.ensureStore())
  }

  static createPlaylist(name: string): boolean {
    const store = this.ensureStore()
    if (store[name]) return false
    store[name] = []
    this.save(store)
    return true
  }

  static deletePlaylist(name: string): boolean {
    const store = this.ensureStore()
    if (!store[name]) return false
    delete store[name]
    this.save(store)
    return true
  }

  static addTrack(playlistName: string, track: SearchResult): void {
    const store = this.ensureStore()
    if (!store[playlistName]) store[playlistName] = []
    store[playlistName].push(track)
    this.save(store)
  }

  static getPlaylist(name: string): SearchResult[] {
    const store = this.ensureStore()
    return store[name] ?? []
  }

  static getTrackCount(name: string): number {
    return this.getPlaylist(name).length
  }

  static removeTrack(playlistName: string, index: number): boolean {
    const store = this.ensureStore()
    if (!store[playlistName] || index < 0 || index >= store[playlistName].length) return false
    store[playlistName].splice(index, 1)
    this.save(store)
    return true
  }
}
