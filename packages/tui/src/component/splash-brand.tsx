import { TextAttributes } from "@opentui/core"
import { For } from "solid-js"
import { useTheme } from "../context/theme"

const ASCII_LOGO = [
  "                _  _____          _      ",
  "    /\\         (_)/ ____|        | |     ",
  "   /  \\   _ __  _| |     ___   __| | ___ ",
  "  / /\\ \\ | '_ \\| | |    / _ \\ / _` |/ _ \\",
  " / ____ \\| | | | | |___| (_) | (_| |  __/",
  "/_/    \\_\\_| |_|_|\\_____\\___/ \\__,_|\\___|",
  "                                         ",
  "                                         ",
]

export function SplashBrand() {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" alignItems="center" paddingTop={1} paddingBottom={1}>
      <For each={ASCII_LOGO}>
        {(line) => (
          <text fg={theme.primary} attributes={TextAttributes.BOLD} selectable={false}>
            {line}
          </text>
        )}
      </For>
    </box>
  )
}
