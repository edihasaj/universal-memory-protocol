/** Recall -> AMP adapter: serve AMP over Recall's engine. See ./README.md. */

export {
  RecallStore,
  type RecallBackend,
} from "./store.ts";
export {
  recallMemoryToRecord,
  recordToRecallCapture,
  recallTypeToKind,
  kindToRecallType,
  toAmpId,
  fromAmpId,
  type RecallMemory,
  type RecallType,
  type RecallScope,
  type RecallStatus,
} from "./map.ts";
