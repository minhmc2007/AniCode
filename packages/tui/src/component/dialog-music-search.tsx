import { TextAttributes } from "@opentui/core"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createResource, createMemo } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { YtMusicPlayer, type SearchResult } from "../service/ytmusic"
import { PlaylistManager } from "../service/playlist"

export type MusicSearchDialogProps = {
  query: string
  mode: "play" | "add_to_playlist"
}

export function MusicSearchDialog(props: MusicSearchDialogProps) {
  const dialog = useDialog()
  const toast = useToast()
  const { theme } = useTheme()
  dialog.setSize("large")

  const [results] = createResource(async () => {
    const dep = YtMusicPlayer.checkDeps()
    if (dep) {
      toast.show({ title: "Missing Dependency", message: `Install: sudo pacman -S ${dep}`, variant: "error" })
      dialog.clear()
      return []
    }
    toast.show({ message: `Searching YT Music for "${props.query}"...`, variant: "info", duration: 2000 })
    return YtMusicPlayer.search(props.query)
  })

  async function onSelectTrack(result: SearchResult) {
    if (props.mode === "play") {
      dialog.clear()
      toast.show({ title: "Now Playing", message: result.title, variant: "info", duration: 5000 })
      YtMusicPlayer.play(result.url).catch((err) => {
        toast.show({ title: "Playback Error", message: err.message, variant: "error" })
      })
    } else {
      const playlists = PlaylistManager.getNames()
      if (playlists.length === 0) {
        PlaylistManager.createPlaylist("Favorites")
        PlaylistManager.addTrack("Favorites", result)
        dialog.clear()
        toast.show({ title: "Added to Favorites", message: result.title, variant: "info", duration: 3000 })
      } else if (playlists.length === 1) {
        PlaylistManager.addTrack(playlists[0], result)
        dialog.clear()
        toast.show({ title: `Added to ${playlists[0]}`, message: result.title, variant: "info", duration: 3000 })
      } else {
        const { PlaylistPickerDialog } = await import("./dialog-playlist-picker")
        dialog.replace(() => (
          <PlaylistPickerDialog
            onSelect={(name) => {
              PlaylistManager.addTrack(name, result)
              dialog.clear()
              toast.show({ title: `Added to ${name}`, message: result.title, variant: "info", duration: 3000 })
            }}
          />
        ))
      }
    }
  }

  const options = createMemo<DialogSelectOption<SearchResult>[]>(() => {
    const list = results() ?? []
    return list.map((result) => ({
      title: result.title,
      description: `${result.uploader}  •  ${result.duration}`,
      value: result,
      onSelect: () => onSelectTrack(result),
    }))
  })

  return (
    <DialogSelect
      title={`Search results for "${props.query}"${props.mode === "add_to_playlist" ? " (select to add to playlist)" : ""}`}
      placeholder="Use arrows to browse, Enter to select..."
      options={options()}
      emptyView={
        results.state === "ready" && options().length === 0 ? (
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.warning}>No results found for "{props.query}"</text>
          </box>
        ) : results.state === "errored" ? (
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.error} attributes={TextAttributes.BOLD}>Search failed</text>
            <text fg={theme.textMuted}>Check that yt-dlp is installed and try again.</text>
          </box>
        ) : undefined
      }
    />
  )
}
