import * as v from 'valibot'

// Metatell URL validation schema
const MetatellUrlSchema = v.pipe(
  v.string(),
  v.url('Invalid URL format'),
  v.regex(
    /^https:\/\/metatell\.app\/[A-Za-z0-9]+\//,
    'URL must be a Metatell room URL (e.g., https://metatell.app/LWF5w8n/)',
  ),
)

// Command-line arguments schema
export const CliArgsSchema = v.object({
  url: v.optional(MetatellUrlSchema),
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
