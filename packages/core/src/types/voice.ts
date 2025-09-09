/**
 * Voice-capable client interface
 * Both MetatellClient and AgentClient should implement this
 */
export interface VoiceCapableClient {
  /**
   * Mute or unmute voice
   */
  muteVoice?(muted: boolean): Promise<void>

  /**
   * Get session ID for voice identification
   */
  getSessionId(): string | null

  /**
   * Send voice frame to the server
   */
  sendVoiceFrame?(pcm: Int16Array): Promise<void>
}
