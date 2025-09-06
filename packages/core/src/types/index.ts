/**
 * Core types used across the SDK
 */

/**
 * NAF (Networked A-Frame) component data
 */
export interface NAFComponent {
  networkId: string
  owner: string
  creator: string
  template: string
  components: Record<string, unknown>
}
