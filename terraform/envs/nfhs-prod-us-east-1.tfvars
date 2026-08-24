account_id  = "676920172489"
region      = "us-east-1"
environment = "nfhs-prod"

# name_prefix defaults to "cta-secure-media" — override per-env if needed.
# signing_key_length + token_ttl_default use module defaults.

# VID-3459: blackout sync-writer target. Prod points at prod unity-api;
# read endpoints on /v2/broadcasts are anonymous.
unity_api_base = "https://unity.nfhsnetwork.com"

# Initial prod deploy — token enforcement OFF. Clients CTA-4/5/6/7 haven't
# shipped tokens yet. Flip to "log" once drm-api-lambda's CTA_MINT_URL is
# pointed here and clients are minting; "enforce" only after the UA
# allowlist is seeded (VID-3464).
token_enforcement_mode = "off"

# VID-3458: DMA blackout enforcement mode. Flipped from "log" to
# "enforce" after log-mode soak confirmed the sync-writer + KVS
# blocklist + validator + Metro-Code header pipeline wires up
# correctly on real prod traffic, and after VID-3581 shipped the
# blackout-UI-less-client bypass (dma_bypass_allowlist) + closed the
# path-token DMA regression + landed the allowlist-strip upfront fix.
#
# In enforce, blocked viewers get HTTP 451 "blackout_dma" with
# `Cache-Control: no-store` + `Access-Control-Allow-Origin: *`. UAs
# on dma_bypass_allowlist (Apple TV / iOS / iPad / Android / Roku /
# internal probes — see the dma_bypass_allowlist block below) forward
# instead, with a `dma_bypass_allowlist_hit` audit log line pairing
# 1:1 with what would have been `blackout_dma`.
#
# Rollback: set back to "log" and re-apply. Validator function code
# is otherwise unchanged; only the templatefile-baked constant flips.
# Propagation to the CloudFront edge is typically < 5 min per AWS.
#
# Scope-of-enforcement note: DMA gate fires when the validator sees
# a `CloudFront-Viewer-Metro-Code` header. Prod hls.bcast's
# `broadcast/*` behavior forwards it, so playlists 451 correctly.
# The default `*` (segment) behavior does NOT forward it — the
# validator takes the `blackout_dma_missing_metro` fail-open branch
# on segment requests. Practical effect: enforcement is
# playlist-level. Viewers already playing get cut off on their next
# manifest refresh (~2-8s for live). If instant segment-level
# enforcement is required, follow-up against
# iac-tf-aws-project-video-common/stacks/hls-cloudfront/envs/nfhs-
# prod-us-east-1.tfvars to add CloudFront-Viewer-Metro-Code to the
# default behavior's forward_headers (cache-fragmentation trade-off:
# up to ~210 DMA values × segment URI space).
dma_enforcement_mode = "enforce"

# VID-3449: lock POST /token to AWS_IAM auth, permitting only the
# drm-api-lambda execution role to mint. Anonymous callers get 403 at
# APIGW; any other IAM principal gets 403 via resource policy.
#
# Safe to apply because drm-api-lambda's SigV4 signing path was proven
# against prod on 2026-08-05 (POST /v2/licenses returned a fresh
# cta_token end-to-end after CTA_MINT_URL was flipped to the APIGW
# invoke URL). Applies to `/token` only — /revoke and /revoked stay
# open on the resource policy dimension (they're separately gated).
drm_api_lambda_role_arn = "arn:aws:iam::676920172489:role/drm-api-lambda-role"

# VID-3505: allowlist patterns seeded from a 1h prod traffic sample on
# hls.bcast (2026-08-11-13, ~40K requests). Each native entry is
# TRANSITIONAL and expected to be removed as its app team ships
# path-segment CTA integration (see VID-3507 tracking).
#
# Not active until token_enforcement_mode flips from "off"; safe to
# seed early because the matcher only runs after the off-mode
# short-circuit.
#
# VID-3581: Chromecast (` CrKey/[0-9]`) added per Andy's client-UA
# survey (Cody on VID-3505). Unanchored substring match — Chromecast
# sends a full Chrome/Safari UA with ` CrKey/…` at the tail.
#
# See stage tfvars for the per-pattern justification + rationale.
legacy_client_allowlist = [
  "^AppleCoreMedia/",
  "^NFHS Network/[0-9.]+ \\(Linux;Android",
  "^Roku/DVP-",
  "^Mozilla/5\\.0 \\(compatible; NFHSStreamMonitor",
  "^nfhs-cc-api/",
  "^nfhs-postprocessor",
  " CrKey/[0-9]",
]

# VID-3581: DMA-blackout bypass allowlist. Five patterns to start —
# product direction (Robb Schuneman, 2026-08-18) is that any client on
# the token allowlist should also skip the 451 blackout gate during
# the transitional window, because none of them render a
# blackout-message UI to the viewer yet (VID-3507 tracks the per-app
# retirement of these entries). Chromecast (`CrKey/[0-9]`) is
# deliberately not included — see stage tfvars for the per-Cody
# rationale.
#
# VID-3587 header override: nfhs-mobile 3.6.6+ (iOS + Android) sends
# `X-NFHS-Client-Version` on manifest requests. The validator revokes
# the UA-based bypass when that header is present with any non-empty
# value. Applies to THIS list only; token bypass stays UA-only because
# native clients still can't mint CTA tokens. See stage tfvars for the
# full VID-3587 rationale.
#
# See stage tfvars for the per-pattern justification + rationale.
dma_bypass_allowlist = [
  "^AppleCoreMedia/",
  "^NFHS Network/[0-9.]+ \\(Linux;Android",
  "^Roku/DVP-",
  "^Mozilla/5\\.0 \\(compatible; NFHSStreamMonitor",
  "^nfhs-cc-api/",
  "^nfhs-postprocessor",
]
