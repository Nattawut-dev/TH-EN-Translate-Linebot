# Thai–German LINE translation bot

Next.js webhook translating Thai ↔ German with the existing Gemini 2.5 Flash model.
Replies contain only concise, natural translations. The bot never asks clarification
questions or adds warnings, prices, units, specifications, or commitments.

The construction glossary covers structure, electricity, solar, pools and built-in
furniture. Current-message meaning takes precedence over the domain and history.
Ambiguous terms stay ambiguous or retain the original term in the translation.

## Context limits

**There is no durable conversation store.** Context exists only inside one incoming
webhook batch, separated by channel and user/group/room, with speaker attribution.
It is limited to 12 turns, 2,000 Unicode characters and 30 minutes, and contains
original messages only. A new request starts without history. Event deduplication
and ordering are also limited to the current batch. No raw chat or secrets are logged.

Cross-request history, global event deduplication and ordering need an explicitly
approved shared store; process-global memory is deliberately not used as a substitute.

## Local checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Tests use synthetic fixtures and a mocked model; they do not establish live model
quality. `npm run eval:smoke` separately runs up to 8 synthetic acceptance cases
against the existing Gemini account. Set `TRANSLATION_EVAL_LIMIT` to at most 18
for the full fixture set. This command uses API quota and never sends LINE messages.

Environment variables: `GEMINI_API_KEY`, `LINE_CHANNEL_SECRET`,
`LINE_CHANNEL_ACCESS_TOKEN`. Keep their values out of source control and logs.

`GET /api/webhook` reports health, prompt version and the limited context mode.
There is no additional public translation API. Synthetic model checks run through
the local CLI evaluator and never send LINE messages.

## Deployment

Deploy only to the verified existing translation project. This checkout currently
has no Vercel project binding. Record the previous deployment and rollback command
before publishing; verify health and an authenticated synthetic translation afterward.
