/**
 * Common validation schemas used across the application
 */

import * as v from 'valibot'

// URL validation with proper format (supports any domain with hub ID path)
export const UrlSchema = v.pipe(
  v.string(),
  v.url(),
  v.regex(
    /^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?\/[A-Za-z0-9_-]+\/?/,
    'Must be a valid room URL with hub ID (e.g., https://example.com/hubId/)',
  ),
)

// Non-empty string validation
export const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))

// Positive number validation
export const PositiveNumberSchema = v.pipe(v.number(), v.minValue(0))

// Rate limit validation (0.1 to 100)
export const RateLimitSchema = v.pipe(v.number(), v.minValue(0.1), v.maxValue(100))

// Boolean string validation (for environment variables)
export const BooleanStringSchema = v.pipe(v.string(), v.picklist(['true', 'false']))

// Token validation
export const TokenSchema = v.pipe(v.string(), v.minLength(1))

// Display name validation
export const DisplayNameSchema = v.string()

// Avatar ID validation
export const AvatarIdSchema = v.string()

// Debug mode validation
export const DebugModeSchema = v.boolean()
