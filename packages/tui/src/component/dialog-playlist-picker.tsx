import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { createMemo } from "solid-js"
import { useDialog } from "../ui/dialog"
import { PlaylistManager } from "../service/playlist"

export type PlaylistPickerDialogProps = {
  onSelect: (name: string) => void
}

export function PlaylistPickerDialog(props: PlaylistPickerDialogProps) {
  const dialog = useDialog()
  dialog.setSize("medium")

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    return PlaylistManager.getNames().map((name) => ({
      title: name,
      description: `${PlaylistManager.getTrackCount(name)} tracks`,
      value: name,
      onSelect: () => {
        props.onSelect(name)
      },
    }))
  })

  return (
    <DialogSelect
      title="Select a playlist"
      placeholder="Choose a playlist..."
      options={options()}
    />
  )
}
