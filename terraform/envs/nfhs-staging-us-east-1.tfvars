account_id  = "877726356953"
region      = "us-east-1"
environment = "nfhs-staging"

# name_prefix defaults to "cta-secure-media" — override per-env if needed.
# signing_key_length + token_ttl_default use module defaults.

# VID-3449: gate POST /api/token to the drm-api-lambda role only. Anonymous
# POSTs return 403 at APIGW; drm-api-lambda's SigV4-signed calls (VID-3448)
# continue to work.
drm_api_lambda_role_arn = "arn:aws:iam::877726356953:role/drm-api-lambda-role"

# VID-3459: blackout sync-writer target. Stage unity-api mirrors prod's
# publisher/broadcast state with test data; read endpoints on both are
# anonymous.
unity_api_base = "https://unity.stage.nfhsnetwork.com"

# Break-glass bypass: validator forwards every viewer request unmodified.
# Off in stage while VID-3450 geo-fence design + zip/DMA edge check is in
# flight — flipping back to true (or omitting) restores enforcement.
token_validation_enabled = false

# VID-3458: DMA blackout enforcement mode. Flipped to "enforce" after
# end-to-end smoke against a test broadcast (bdcc0ab49f6f9 with DMAs
# [524,602]) confirmed the full pipeline — sync-writer → KVS → validator
# → CloudWatch log — works in log mode. In enforce, blocked viewers get
# HTTP 451 "blackout_dma" with Cache-Control: no-store.
dma_enforcement_mode = "enforce"
