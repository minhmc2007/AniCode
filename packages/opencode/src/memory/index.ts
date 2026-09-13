import { makeGlobalNode } from "@anicode-ai/core/effect/app-node"
import { Global } from "@anicode-ai/core/global"
import { FSUtil } from "@anicode-ai/core/fs-util"
import { Context, Effect, Layer } from "effect"
import path from "path"

const MEMORY_DIR = "memory"

export interface MemoryEntry {
  name: string
  priority: 1 | 2 | 3
  tags: string[]
  created: string
  updated: string
  content: string
}

export interface Interface {
  readonly list: () => Effect.Effect<MemoryEntry[], never>
  readonly read: (name: string) => Effect.Effect<MemoryEntry | undefined, never>
  readonly create: (input: {
    name: string
    priority: 1 | 2 | 3
    tags?: string[]
    content: string
  }) => Effect.Effect<MemoryEntry, never>
  readonly update: (
    name: string,
    input: { priority?: 1 | 2 | 3; tags?: string[]; content?: string }
  ) => Effect.Effect<MemoryEntry, never>
  readonly delete: (name: string) => Effect.Effect<void, never>
  readonly matchKeywords: (message: string) => Effect.Effect<MemoryEntry[], never>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Memory") {}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, content: raw }
  const [, yaml, content] = match
  const meta: Record<string, unknown> = {}
  for (const line of yaml.split("\n")) {
    const [key, ...rest] = line.split(":")
    if (!key) continue
    const value = rest.join(":").trim()
    if (key === "tags") {
      meta.tags = value
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    } else if (key === "priority") {
      meta.priority = Number(value) as 1 | 2 | 3
    } else {
      meta[key] = value
    }
  }
  return { meta, content: content.trim() }
}

function serializeFrontmatter(entry: Omit<MemoryEntry, "name">): string {
  const lines = [
    "---",
    `priority: ${entry.priority}`,
    `tags: [${entry.tags.join(", ")}]`,
    `created: ${entry.created}`,
    `updated: ${entry.updated}`,
    "---",
    "",
    entry.content,
  ]
  return lines.join("\n")
}

function nameToFilename(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") + ".md"
}

function filenameToName(filename: string): string {
  return filename.replace(/\.md$/, "").replace(/_/g, " ")
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service

    const memoryDir = path.join(global.config, MEMORY_DIR)

    const ensureDir = Effect.fn("Memory.ensureDir")(function* () {
      yield* fs.makeDirectory(memoryDir, { recursive: true }).pipe(Effect.catch(() => Effect.void))
    })

    const list: Interface["list"] = () =>
      Effect.gen(function* () {
        yield* ensureDir()
        const files = yield* fs.glob("*.md", { cwd: memoryDir, absolute: false })
        const entries: MemoryEntry[] = []
        for (const file of files) {
          const raw = yield* fs.readFileStringSafe(path.join(memoryDir, file))
          if (!raw) continue
          const { meta, content } = parseFrontmatter(raw)
          entries.push({
            name: filenameToName(file),
            priority: (meta.priority as 1 | 2 | 3) ?? 2,
            tags: (meta.tags as string[]) ?? [],
            created: (meta.created as string) ?? new Date().toISOString(),
            updated: (meta.updated as string) ?? new Date().toISOString(),
            content,
          })
        }
        return entries
      }).pipe(Effect.catch(() => Effect.succeed([] as MemoryEntry[]))) as Effect.Effect<MemoryEntry[], never>

    const read: Interface["read"] = (name) =>
      Effect.gen(function* () {
        const filename = nameToFilename(name)
        const filepath = path.join(memoryDir, filename)
        const exists = yield* fs.existsSafe(filepath)
        if (!exists) return undefined
        const raw = yield* fs.readFileStringSafe(filepath)
        if (!raw) return undefined
        const { meta, content } = parseFrontmatter(raw)
        return {
          name,
          priority: (meta.priority as 1 | 2 | 3) ?? 2,
          tags: (meta.tags as string[]) ?? [],
          created: (meta.created as string) ?? new Date().toISOString(),
          updated: (meta.updated as string) ?? new Date().toISOString(),
          content,
        }
      }).pipe(Effect.catch(() => Effect.succeed(undefined))) as Effect.Effect<MemoryEntry | undefined, never>

    const create: Interface["create"] = (input) =>
      Effect.gen(function* () {
        yield* ensureDir()
        const now = new Date().toISOString()
        const entry: MemoryEntry = {
          name: input.name,
          priority: input.priority,
          tags: input.tags ?? [],
          created: now,
          updated: now,
          content: input.content,
        }
        const filename = nameToFilename(input.name)
        yield* fs.writeFileString(path.join(memoryDir, filename), serializeFrontmatter(entry))
        return entry
      }).pipe(Effect.catch(() => Effect.die(new Error("Failed to create memory")))) as Effect.Effect<MemoryEntry, never>

    const update: Interface["update"] = (name, input) =>
      Effect.gen(function* () {
        const existing = yield* read(name)
        if (!existing) return yield* create({ name, priority: input.priority ?? 2, tags: input.tags, content: input.content ?? "" })
        const updated: MemoryEntry = {
          ...existing,
          priority: input.priority ?? existing.priority,
          tags: input.tags ?? existing.tags,
          content: input.content ?? existing.content,
          updated: new Date().toISOString(),
        }
        const filename = nameToFilename(name)
        yield* fs.writeFileString(path.join(memoryDir, filename), serializeFrontmatter(updated))
        return updated
      }).pipe(Effect.catch(() => Effect.die(new Error("Failed to update memory")))) as Effect.Effect<MemoryEntry, never>

    const del: Interface["delete"] = (name) =>
      Effect.gen(function* () {
        const filename = nameToFilename(name)
        const filepath = path.join(memoryDir, filename)
        const exists = yield* fs.existsSafe(filepath)
        if (exists) {
          yield* Effect.tryPromise(() => Bun.file(filepath).exists()).pipe(Effect.catch(() => Effect.succeed(false)))
          yield* Effect.tryPromise(() => Bun.write(filepath, "")).pipe(Effect.catch(() => Effect.void))
        }
      }).pipe(Effect.catch(() => Effect.void)) as Effect.Effect<void, never>

    const matchKeywords: Interface["matchKeywords"] = (message) =>
      Effect.gen(function* () {
        const entries = yield* list()
        const lower = message.toLowerCase()
        return entries.filter(
          (e) =>
            e.priority === 2 &&
            (e.tags.some((tag) => lower.includes(tag.toLowerCase())) ||
              lower.includes(e.name.toLowerCase()))
        )
      }).pipe(Effect.catch(() => Effect.succeed([] as MemoryEntry[]))) as Effect.Effect<MemoryEntry[], never>

    return Service.of({ list, read, create, update, delete: del, matchKeywords })
  })
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Global.node, FSUtil.node],
})

export * as Memory from "."
