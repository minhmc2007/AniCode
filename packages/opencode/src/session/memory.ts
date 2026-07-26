import nodePath from "path"
import { Effect } from "effect"
import { FSUtil } from "@anicode-ai/core/fs-util"

const MEMORY_DIR = ".anicode"
const MEMORY_FILE = "memory.md"

const DEFAULT_TEMPLATE = [
  "# AniCode Project Memory",
  "",
  "This file stores persistent project context and learnings across sessions.",
  "The AI agent can read and write to this file autonomously.",
  "",
  "## Project Context",
  "",
  "_Initialize project context here_",
  "",
  "## Architecture Decisions",
  "",
  "_Record key architectural decisions here_",
  "",
  "## Learnings & Observations",
  "",
  "_Record learnings about the codebase here_",
].join("\n")

export function memoryPath(projectRoot: string): string {
  return nodePath.join(projectRoot, MEMORY_DIR, MEMORY_FILE)
}

export const load = Effect.fn("AniCodeMemory.load")(function* (projectRoot: string) {
  const fs = yield* FSUtil.Service
  const filepath = memoryPath(projectRoot)
  const exists = yield* fs.existsSafe(filepath)
  if (!exists) {
    yield* fs.makeDirectory(nodePath.join(projectRoot, MEMORY_DIR), { recursive: true })
    yield* fs.writeFileString(filepath, DEFAULT_TEMPLATE)
    return DEFAULT_TEMPLATE
  }
  return yield* fs.readFileString(filepath)
})

export const save = Effect.fn("AniCodeMemory.save")(function* (projectRoot: string, content: string) {
  const fs = yield* FSUtil.Service
  yield* fs.makeDirectory(nodePath.join(projectRoot, MEMORY_DIR), { recursive: true }).pipe(Effect.catch(() => Effect.void))
  const timestamp = new Date().toISOString()
  const existing = yield* fs.readFileString(memoryPath(projectRoot)).pipe(Effect.catch(() => Effect.succeed("")))
  const entry = existing ? `\n## ${timestamp}\n\n${content}\n` : `## ${timestamp}\n\n${content}\n`
  yield* fs.writeFileString(memoryPath(projectRoot), existing ? existing + entry : entry)
})

export * as AniCodeMemory from "./memory"
