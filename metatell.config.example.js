// Example JavaScript configuration for Metatell AI Bot
// Rename to metatell.config.js to use

module.exports = {
  // Basic configuration
  url: process.env.METATELL_URL || 'https://metatell.app/your-room-id',
  token: process.env.METATELL_TOKEN || '@.metatell-token',

  // Bot profile
  profile: {
    displayName: process.env.BOT_NAME || 'My AI Bot',
    avatarId: process.env.AVATAR_ID || 'default-avatar',
  },

  // Named profiles for different environments
  profiles: {
    development: {
      url: 'https://metatell-dev.app/dev-room',
      debug: true,
      profile: {
        displayName: 'Dev Bot',
      },
    },

    production: {
      url: 'https://metatell.app/prod-room',
      botAccessKey: '@.bot-access-key',
      profile: {
        displayName: 'Production Bot',
      },
    },

    // Dynamic profile based on environment
    [process.env.NODE_ENV || 'custom']: {
      url: process.env.CUSTOM_URL,
      profile: {
        displayName: `${process.env.NODE_ENV} Bot`,
      },
    },
  },

  // Rate limiting
  rate: {
    messagesPerSec: 2,
    movesPerSec: 5,
    looksPerSec: 10,
  },

  // Enable debug in non-production environments
  debug: process.env.NODE_ENV !== 'production',
}
