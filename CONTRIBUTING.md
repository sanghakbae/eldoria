# Contributing

## Workflow

1. Read `SRS.md` and the relevant ADRs before changing architecture.
2. Work on the next incomplete task or one explicitly selected vertical slice.
3. Keep changes scoped; avoid unrelated rewrites.
4. Add or update tests for meaningful rules.
5. Run `pnpm check` and `pnpm build` before handing off work.
6. Record a new ADR when a significant architectural choice changes system boundaries, storage, protocol shape, or infrastructure.

## Code boundaries

- Browser code sends player intent and renders server results.
- The game server validates and applies authoritative state mutations.
- Shared packages may contain types and deterministic calculations, but importing them in the client never makes client results authoritative.
- Persistent economic mutations require transactional server-side handling and an audit event.

## Content and assets

Only original work or material explicitly licensed for this project may be committed. Store gameplay values in `data/` and reference visual assets through stable asset IDs rather than direct paths in gameplay rules.

## Secrets

Copy future `.env.example` files to local `.env` files. Never commit ID tokens, API credentials, service-account JSON, private keys, or production data.
