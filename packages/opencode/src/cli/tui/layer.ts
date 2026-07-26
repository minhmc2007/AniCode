import { run as runTui, type TuiInput } from "@anicode-ai/tui"
import { Global } from "@anicode-ai/core/global"
import { AppNodeBuilder } from "@anicode-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
