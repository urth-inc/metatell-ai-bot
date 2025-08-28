import * as v from 'valibot'

// Room URL validation schema (any domain with hub ID)
const RoomUrlSchema = v.pipe(
  v.string(),
  v.url('Invalid URL format'),
  v.regex(
    /^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?\/[A-Za-z0-9_-]+\/?/,
    'URL must be a room URL with hub ID (e.g., https://example.com/hubId/)',
  ),
)

// Command-line arguments schema
export const CliArgsSchema = v.object({
  url: v.optional(RoomUrlSchema),
  token: v.optional(v.string()),
  debug: v.optional(v.boolean()),
  profile: v.optional(v.string()),
})

export type CliArgs = v.InferOutput<typeof CliArgsSchema>

// Parse and validate command-line arguments
export function parseCliArgs(options: Record<string, unknown>, url?: string): CliArgs {
  const args = {
    url,
    token: options.token,
    debug: options.debug || false,
    profile: options.profile,
  }

  // Filter out undefined values
  const filteredArgs = Object.fromEntries(
    Object.entries(args).filter(([_, value]) => value !== undefined),
  )

  return v.parse(CliArgsSchema, filteredArgs)
}
