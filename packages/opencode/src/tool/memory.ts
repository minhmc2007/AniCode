import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { AniCodeMemory } from "@/session/memory"
import { InstanceState } from "@/effect/instance-state"

export const Parameters = Schema.Struct({
  content: Schema.String.annotate({ description: "The memory content to save" }),
  category: Schema.optional(
    Schema.Literals(["context", "architecture", "learning", "decision"] as const),
  ).annotate({ description: "The category of the memory entry (default: learning)" }),
})

const init: Tool.DefWithoutID = {
  description:
    "Save important facts, architectural decisions, or learnings to persistent project memory stored in .anicode/memory.md. This memory persists across sessions and helps the AI maintain context about the project over time.",
  parameters: Parameters,
  execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
    Effect.gen(function* () {
      const instanceCtx = yield* InstanceState.context
      const category = params.category ?? "learning"
      const labeled = category === "learning" ? params.content : `[${category}] ${params.content}`
      yield* AniCodeMemory.save(instanceCtx.worktree, labeled)

      return {
        title: `Saved ${category} memory`,
        output: `Memory saved to .anicode/memory.md (category: ${category})`,
        metadata: { category },
      }
    }).pipe(Effect.orDie) as unknown as Effect.Effect<Tool.ExecuteResult>,
}

export const MemorySaveTool: Effect.Effect<Tool.Info> = Effect.succeed({
  id: "anicode_save_memory",
  init: () => Effect.succeed(init),
})
