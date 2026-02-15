# OZ.md

This repository contains a vendored copy of the Oz Python SDK (`oz_agent_sdk`).

## Notes

- Most files under `src/oz_agent_sdk/` are generated from an OpenAPI spec.
- This vendored copy may include local patches (for example, defaults that point to a local `/api/v1`).

## Environment Variables

- `OZ_API_KEY`: API key for authentication.
- `OZ_API_BASE_URL`: Base URL for the API (defaults to `http://localhost:3000/api/v1` in this vendored copy).

