/** Protokollereignis für die Technik-Ansicht */
export interface ProtocolEvent {
  at: string
  direction: 'out' | 'in' | 'info'
  title: string
  detail?: unknown
}
