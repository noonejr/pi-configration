# Pi configuration

Sanitized, portable configuration for [pi](https://pi.dev). This repository intentionally contains no credentials.

## Included

- `models.json` — custom Amazon Bedrock Mantle providers and models, including Claude Fable 5 adaptive-thinking levels.
- `settings.json` — default model, thinking level, enabled models, and pi package sources.
- `extensions/claude-status-line.ts` — status-line integration.
- `extensions/herdr-agent-state.ts` — optional Herdr agent-state integration; it is inactive unless the Herdr environment variables are present.
- `install.sh` — installs the configuration into the user-level pi directory and backs up differing files first.

## Install

```bash
git clone git@github.com:noonejr/pi-plugins.git
cd pi-plugins
./install.sh
```

By default, files are installed under `~/.pi/agent`. Set `PI_CODING_AGENT_DIR` to use another location.

Start pi after installation. In an existing session, run `/reload`.

## Authentication

Credentials are deliberately excluded. The Mantle providers resolve their API key from the environment:

```bash
export AWS_BEARER_TOKEN_BEDROCK="<your Bedrock API key>"
```

Set that variable in your shell or secret manager, never in this repository. Claude Fable 5 also requires the Bedrock account retention mode `provider_data_share`, which must be configured separately in AWS.

## Fable thinking levels

Claude Fable 5 exposes `low`, `medium`, `high`, `xhigh`, and `max`. Adaptive thinking is always enabled, so `off` and pi's synthetic `minimal` level are disabled for this model.

## Deliberately excluded

The following are credentials, generated data, machine-specific state, or installed package caches and must not be committed:

- `auth.json` and `.env*`
- `trust.json`
- `models-store.json`
- `sessions/`, `npm/`, `git/`, and `bin/`
- literal API keys, access tokens, private keys, and certificates
