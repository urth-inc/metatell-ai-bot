/**
 * Configuration validation schemas using valibot
 */

import * as v from 'valibot'

// Profile schema
export const ProfileSchema = v.object({
  displayName: v.optional(v.string()),
  avatarId: v.optional(v.string()),
})

// Rate limiting schema
export const RateSchema = v.object({
  messagesPerSec: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(100))),
  movesPerSec: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(100))),
  looksPerSec: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(100))),
})

// Main configuration schema
export const ConfigSchema = v.object({
  url: v.optional(v.pipe(v.string(), v.url())),
  token: v.optional(v.pipe(v.string(), v.minLength(1))),
  profile: v.optional(ProfileSchema),
  rate: v.optional(RateSchema),
  debug: v.optional(v.boolean()),
})

// Configuration with profile name (for stored profiles)
export const ConfigProfileSchema = v.intersect([
  ConfigSchema,
  v.object({
    name: v.pipe(v.string(), v.minLength(1)),
  }),
])

// Config file schema (includes profiles map)
export const ConfigFileSchema = v.object({
  url: v.optional(v.pipe(v.string(), v.url())),
  token: v.optional(v.pipe(v.string(), v.minLength(1))),
  profile: v.optional(ProfileSchema),
  rate: v.optional(RateSchema),
  debug: v.optional(v.boolean()),
  profiles: v.optional(v.record(v.string(), ConfigSchema)),
})

// Environment variables schema
export const EnvVarsSchema = v.object({
  METATELL_URL: v.optional(v.pipe(v.string(), v.url())),
  METATELL_TOKEN: v.optional(v.string()),
  METATELL_AUTH_TOKEN: v.optional(v.string()),
  BOT_NAME: v.optional(v.string()),
  AVATAR_ID: v.optional(v.string()),
  DEBUG: v.optional(v.pipe(v.string(), v.picklist(['true', 'false']))),
})

// Command line flags schema
export const FlagsSchema = v.object({
  '--url': v.optional(v.pipe(v.string(), v.url())),
  '--token': v.optional(v.string()),
  '--profile': v.optional(v.string()),
  '--debug': v.optional(v.boolean()),
})

// Type exports
export type Config = v.InferOutput<typeof ConfigSchema>
export type ConfigProfile = v.InferOutput<typeof ConfigProfileSchema>
export type ConfigFile = v.InferOutput<typeof ConfigFileSchema>
export type EnvVars = v.InferOutput<typeof EnvVarsSchema>
export type Flags = v.InferOutput<typeof FlagsSchema>
