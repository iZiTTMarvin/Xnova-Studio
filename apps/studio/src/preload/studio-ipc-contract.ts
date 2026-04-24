export { STUDIO_BRIDGE_CHANNELS } from '../shared/studio-bridge-contract'

export interface StudioIpcRendererLike {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  on(
    channel: string,
    listener: (_event: unknown, payload: unknown) => void,
  ): this
  removeListener(
    channel: string,
    listener: (_event: unknown, payload: unknown) => void,
  ): this
}
