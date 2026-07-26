import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createMemo } from "solid-js"
import { useDialog } from "../ui/dialog"
import { PlaylistManager } from "../service/playlist"

export function PlaylistListDialog() {
  const dialog = useDialog()
  dialog.setSize("medium")

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    return PlaylistManager.getNames().map((name) => ({
      title: name,
      description: `${PlaylistManager.getTrackCount(name)} tracks`,
      value: name,
      onSelect: async () => {
        const { PlaylistDetailDialog } = await import("./dialog-playlist-detail")
        dialog.replace(() => <PlaylistDetailDialog name={name} />)
      },
    }))
  })

  return (
    <DialogSelect
      title="Your Playlists"
      placeholder=""
      options={options()}
    />
  )
}
