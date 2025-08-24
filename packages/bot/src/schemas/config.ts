/**
 * Configuration-related validation schemas
 */

import * as v from 'valibot'
import {
  AvatarIdSchema,
  BooleanStringSchema,
  DebugModeSchema,
  DisplayNameSchema,
  NonEmptyStringSchema,
  RateLimitSchema,
  TokenSchema,
  UrlSchema,
} from './common.js'

// Profile schema
export const ProfileSchema = v.object({
  displayName: v.optional(DisplayNameSchema),
  avatarId: v.optional(AvatarIdSchema),
})

// Rate limiting schema
export const RateSchema = v.object({
  messagesPerSec: v.optional(RateLimitSchema),
  movesPerSec: v.optional(RateLimitSchema),
  looksPerSec: v.optional(RateLimitSchema),
})

// Main configuration schema
export const ConfigSchema = v.object({
  url: v.optional(UrlSchema),
  token: v.optional(TokenSchema),
  botAccessKey: v.optional(v.string()),
  profile: v.optional(ProfileSchema),
  rate: v.optional(RateSchema),
  debug: v.optional(DebugModeSchema),
})

// Configuration with profile name (for stored profiles)
export const ConfigProfileSchema = v.intersect([
  ConfigSchema,
  v.object({
    name: NonEmptyStringSchema,
  }),
])

// Config file schema (includes profiles map)
export const ConfigFileSchema = v.object({
  url: v.optional(UrlSchema),
  token: v.optional(TokenSchema),
  botAccessKey: v.optional(v.string()),
  profile: v.optional(ProfileSchema),
  rate: v.optional(RateSchema),
  debug: v.optional(DebugModeSchema),
  profiles: v.optional(v.record(v.string(), ConfigSchema)),
})

// Environment variables schema
export const EnvVarsSchema = v.object({
  METATELL_URL: v.optional(UrlSchema),
  METATELL_TOKEN: v.optional(v.string()),
  METATELL_AUTH_TOKEN: v.optional(v.string()),
  BOT_ACCESS_KEY: v.optional(v.string()),
  BOT_NAME: v.optional(v.string()),
  AVATAR_ID: v.optional(v.string()),
  DEBUG: v.optional(BooleanStringSchema),
})

// Command line flags schema
export const FlagsSchema = v.object({
  '--url': v.optional(UrlSchema),
  '--token': v.optional(v.string()),
  '--profile': v.optional(v.string()),
  '--debug': v.optional(DebugModeSchema),
})

// Type exports
export type Config = v.InferOutput<typeof ConfigSchema>
export type ConfigProfile = v.InferOutput<typeof ConfigProfileSchema>
export type ConfigFile = v.InferOutput<typeof ConfigFileSchema>
export type EnvVars = v.InferOutput<typeof EnvVarsSchema>
export type Flags = v.InferOutput<typeof FlagsSchema>
export type Profile = v.InferOutput<typeof ProfileSchema>
export type Rate = v.InferOutput<typeof RateSchema>
