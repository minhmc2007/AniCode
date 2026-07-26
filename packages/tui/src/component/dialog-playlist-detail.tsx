import { type DialogSelectOption } from "../ui/dialog-select"
import { DialogSelect } from "../ui/dialog-select"
import { createMemo, createSignal } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { PlaylistManager } from "../service/playlist"
import { DialogAlert } from "../ui/dialog-alert"

export type PlaylistDetailDialogProps = {
  name: string
}

export function PlaylistDetailDialog(props: PlaylistDetailDialogProps) {
  const dialog = useDialog()
  const toast = useToast()
  dialog.setSize("large")

  const [refresh, setRefresh] = createSignal(0)

  const tracks = createMemo(() => PlaylistManager.getPlaylist(props.name))

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const list = tracks()
    const opts: DialogSelectOption<string>[] = []

    opts.push({
      title: "[ Delete Playlist ]",
      description: `Remove "${props.name}" and all ${list.length} tracks`,
      value: "__delete_playlist__",
      onSelect: () => {
        DialogAlert.show(dialog, "Delete Playlist", `Delete "${props.name}" and all ${list.length} tracks?`).then(() => {
          PlaylistManager.deletePlaylist(props.name)
          dialog.clear()
          toast.show({ message: `Deleted playlist "${props.name}"`, variant: "info", duration: 2000 })
        }).catch(() => {})
      },
    })

    opts.push({
      title: "",
      description: "",
      value: "__separator__",
    })

    list.forEach((track, i) => {
      opts.push({
        title: `${i + 1}. ${track.title}`,
        description: `${track.uploader}  •  ${track.duration}`,
        value: track.url,
        onSelect: () => {
          DialogAlert.show(dialog, "Delete Track", `Delete "${track.title}" from "${props.name}"?`).then(() => {
            PlaylistManager.removeTrack(props.name, i)
            setRefresh(refresh() + 1)
            toast.show({ message: `Deleted "${track.title}"`, variant: "info", duration: 2000 })
          }).catch(() => {})
        },
      })
    })

    return opts
  })

  return (
    <DialogSelect
      title={`${props.name} (${tracks().length} tracks)`}
      placeholder="Select a track to delete, or delete the whole playlist..."
      options={options()}
    />
  )
}
