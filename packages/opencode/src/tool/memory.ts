import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Memory } from "@/memory"

const Parameters = Schema.Struct({
  operation: Schema.Literals(["list", "read", "create", "update", "delete"] as const).annotate({
    description: "The operation to perform",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: "Memory name (used for read, update, delete). Spaces become underscores in filename.",
  }),
  priority: Schema.optional(Schema.Literals([1, 2, 3] as const)).annotate({
    description:
      "Priority level: 1 = not loaded by default (only when explicitly asked), 2 = loaded when topic matches keywords, 3 = always loaded in system prompt",
  }),
  tags: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Keywords for priority 2 matching. Memory loads when user message contains these keywords.",
  }),
  content: Schema.optional(Schema.String).annotate({
    description: "The memory content (used for create and update)",
  }),
})

export const MemoryTool = Tool.define(
  "memory",
  Effect.gen(function* () {
    const memory = yield* Memory.Service

    return {
      description: `Manage global persistent memory that persists across all projects and sessions.

Priority system:
- Priority 1: Not loaded by default. Only when user explicitly asks.
- Priority 2: Loaded when user message contains matching keywords from tags.
- Priority 3: Always loaded in system prompt.

When to save memory:
- User preferences or coding style preferences
- Important patterns or conventions the user wants to remember
- Architecture decisions or project setup that applies globally
- Any information the user says "remember this" or "save this"

Keep memory content concise but informative. Don't write excessive text.`,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          switch (params.operation) {
            case "list": {
              const entries = yield* memory.list()
              if (entries.length === 0) {
                return {
                  title: "No memories",
                  output: "No memory entries found. Use create to add new memories.",
                  metadata: {},
                }
              }
              const formatted = entries
                .map((e) => `- ${e.name} (priority: ${e.priority}, tags: [${e.tags.join(", ")}])`)
                .join("\n")
              return {
                title: `${entries.length} memories`,
                output: formatted,
                metadata: {},
              }
            }

            case "read": {
              if (!params.name) return { title: "Error", output: "name is required for read", metadata: {} }
              const entry = yield* memory.read(params.name)
              if (!entry) {
                return {
                  title: "Not found",
                  output: `Memory '${params.name}' not found`,
                  metadata: {},
                }
              }
              return {
                title: entry.name,
                output: `Priority: ${entry.priority}\nTags: [${entry.tags.join(", ")}]\nUpdated: ${entry.updated}\n\n${entry.content}`,
                metadata: {},
              }
            }

            case "create": {
              if (!params.name) return { title: "Error", output: "name is required for create", metadata: {} }
              if (!params.content) return { title: "Error", output: "content is required for create", metadata: {} }
              const entry = yield* memory.create({
                name: params.name,
                priority: params.priority ?? 2,
                tags: params.tags ? [...params.tags] : undefined,
                content: params.content,
              })
              return {
                title: `Created: ${entry.name}`,
                output: `Memory '${entry.name}' created with priority ${entry.priority}`,
                metadata: {},
              }
            }

            case "update": {
              if (!params.name) return { title: "Error", output: "name is required for update", metadata: {} }
              const existing = yield* memory.read(params.name)
              if (!existing) {
                return {
                  title: "Not found",
                  output: `Memory '${params.name}' not found. Use create instead.`,
                  metadata: {},
                }
              }
              const updated = yield* memory.update(params.name, {
                priority: params.priority,
                tags: params.tags ? [...params.tags] : undefined,
                content: params.content,
              })
              return {
                title: `Updated: ${updated.name}`,
                output: `Memory '${updated.name}' updated`,
                metadata: {},
              }
            }

            case "delete": {
              if (!params.name) return { title: "Error", output: "name is required for delete", metadata: {} }
              yield* memory.delete(params.name)
              return {
                title: `Deleted: ${params.name}`,
                output: `Memory '${params.name}' deleted`,
                metadata: {},
              }
            }
          }
        }).pipe(Effect.orDie),
    }
  }),
)
