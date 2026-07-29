import { EventEmitter } from "events"

export const PtyBridge = new EventEmitter()

export const PtyManager = {
  active: false,
  writeToPty: null as ((data: string) => void) | null,
  write: (data: string) => {
    if (PtyManager.active && PtyManager.writeToPty) {
      PtyManager.writeToPty(data)
    }
  },
}


