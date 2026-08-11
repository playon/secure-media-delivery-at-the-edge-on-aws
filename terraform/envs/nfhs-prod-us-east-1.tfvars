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

# VID-3458: DMA blackout enforcement mode. Starts in "log" — validator
# computes the block decision and emits CloudWatch lines against real
# prod traffic without blocking anyone. Flip to "enforce" after the
# log-mode signal is clean and the hls.bcast prod distribution has the
# validator attached.
dma_enforcement_mode = "log"

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
# See stage tfvars for the per-pattern justification + rationale.
legacy_client_allowlist = [
  "^AppleCoreMedia/",
  "^NFHS Network/[0-9.]+ \\(Linux;Android",
  "^Roku/DVP-",
  "^Mozilla/5\\.0 \\(compatible; NFHSStreamMonitor",
  "^nfhs-cc-api/",
]
