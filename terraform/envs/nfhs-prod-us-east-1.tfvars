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

# drm_api_lambda_role_arn omitted — /api/token stays anonymous until
# we're ready to enforce the SigV4 lockdown (VID-3449). Add the prod
# drm-api-lambda role ARN when flipping.
