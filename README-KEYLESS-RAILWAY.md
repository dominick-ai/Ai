# Tabo AI — keyless provider build

This build keeps Tabo's existing frontend and Node backend and replaces the active chat route with three public, anonymous AI gateways. **No personal AI-provider API key is required for normal chat or Code mode.**

## Active AI routes

1. **Kilo AI Gateway** (`z-ai/glm-5:free`) — primary. Kilo documents anonymous access for free models and currently lists a shared limit of 200 requests per hour per IP. The model catalog and free availability can change; Tabo may need a model-ID update if this model is retired.
2. **LLMFaucet** (`auto:smart`) — first backup. It is an OpenAI-compatible public router and documents 20 anonymous requests per day per IP. It is experimental and its maintainers warn that free upstream capacity may slow down or disappear. Since Tabo's backend makes the request, visitors share the hosting server's public IP quota.
3. **AI Horde** (`auto`) — community fallback. Its OpenAI-compatible endpoint accepts the documented anonymous token `0000000000`; requests without a personal key receive low queue priority and may wait.

Tabo tries the next route when a provider is unavailable, times out, or rate-limits. The included automated test uses mocked provider responses; it does not prove that the live providers will be available at deployment time.

## Privacy note

Chat prompts are sent to whichever third-party gateway answers. Their privacy and retention practices apply. Do not enter passwords, addresses, school details, phone numbers, or other private information. Anonymous free services can change their limits without notice.

## Deploy without publishing the source to GitHub

This project includes a Dockerfile and Railway configuration. Railway's CLI can deploy a local directory directly; a GitHub repository is not required.

1. Install Node.js 22+ and the Railway CLI on a computer.
2. Open this project folder in a terminal and run `railway login`.
3. Run `railway init` to create a project, then `railway up` to deploy this folder.
4. Generate a public domain for the service in Railway.
5. Confirm `/healthz` returns `{"ok":true}` and then test a real chat response.

**Billing and persistence:** check the current Railway plan and have a parent/guardian review any billing or upgrade prompt before creating paid resources. The default SQLite file is local to the container and may be lost when Railway recreates it. Durable data needs a persistent volume or a remote Turso database, which may add cost and requires private database credentials.

## Required app secret

Set `TABO_SIGNING_SECRET` in the host's private environment settings to a long random value. It signs app tokens and is not an AI-provider key. Never put it in frontend code or a public repository. The app will run without it by generating a temporary secret, but signed tokens may stop working after a restart.

## Local run and checks

- Node.js 22 or later
- `npm install`
- `npm start`
- Visit `/healthz` and confirm `{"ok":true}`
- Run `npm run test:keyless` for the mocked provider-routing test

The smoke test validates Tabo's provider selection and fallback logic with simulated responses. A real provider request and a live hosted deployment still need to be tested after deployment.
