import { EventEmitter } from "events"

export const PtyBridge = new EventEmitter()

export const PtyManager = {
  active: false,
  writeCallback: null as ((data: string) => void) | null,
  write: (data: string) => {
    PtyBridge.emit("input", data)
    if (PtyManager.active && PtyManager.writeCallback) {
      PtyManager.writeCallback(data)
    }
  },
}


