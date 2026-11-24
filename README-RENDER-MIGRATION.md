# Tabo AI migration notes

The current keyless build uses the Kilo AI Gateway as its primary anonymous free-model route, with LLMFaucet and AI Horde as backups. See `README-KEYLESS-RAILWAY.md` for provider limits, privacy notes, and local-directory deployment steps.

The app no longer requires Cloudflare Workers or a personal AI-provider API key for normal chat. It can be deployed from this local folder with Railway CLI; publishing the source to GitHub is not required. Hosting, durable database storage, and any billing approval are separate from the source-code package.
