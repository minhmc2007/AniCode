export * as File from "./file"

import { Revert } from "@anicode-ai/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
