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

# VID-3464 / VID-3458 test-isolation: rolled back from "enforce" to
# "log" so DMA-gate behavior can be observed in isolation from the
# token check. In enforce, any tokenless request 401s at the token
# gate before the DMA gate has anything to compare against — the
# blackout_dma / dma_bypass_allowlist_hit code paths never fire for
# unauthed traffic. In log, token check runs and logs failures via
# `token_reject reason=… mode=log` but forwards the request, so the
# DMA gate is the only thing that can actually block a viewer on
# stage.
#
# Concretely: this lets us curl a blocked broadcast without minting
# a real token and still hit the 451 path, and lets browser probes
# from any UA reach the DMA decision instead of getting stopped at
# `missing_token`.
#
# Restore to "enforce" once DMA-gate testing is done. Function code
# unchanged; only the templatefile-baked constant flips.
token_enforcement_mode = "log"

# VID-3505: allowlist patterns seeded from a 1h prod traffic sample on
# hls.bcast (2026-08-11-13, ~40K requests). Each covers a client
# category that hasn't yet integrated CTA URL construction; every native
# entry is TRANSITIONAL and expected to be removed once its app team
# ships path-segment integration (VID-3492/VID-3493's relative URIs let
# native players cascade `/<token>/…` prefixes through segment fetches,
# so nothing about AVPlayer/ExoPlayer/Roku's HLS handler blocks this —
# the work is in each app's URL-construction path).
#
# Runtime cost is linear per request — keep list under ~20 entries.
#
#   ^AppleCoreMedia/                             — Apple TV + iOS + iPad
#                                                  native (80% of hourly
#                                                  requests).
#                                                  TRANSITIONAL: remove
#                                                  once Apple TV, iOS,
#                                                  iPad apps ship
#                                                  path-segment token
#                                                  construction.
#
#   ^NFHS Network/[0-9.]+ \(Linux;Android        — legacy NFHS Android
#                                                  app (AndroidXMedia3).
#                                                  TRANSITIONAL: remove
#                                                  once the Android app
#                                                  ships CTA integration.
#
#   ^Roku/DVP-                                   — Roku native HLS player.
#                                                  TRANSITIONAL: remove
#                                                  once the Roku channel
#                                                  ships CTA integration.
#                                                  (Roku's HTTP client
#                                                  can't set custom
#                                                  headers, but its HLS
#                                                  handler resolves
#                                                  relative URIs
#                                                  correctly.)
#
#   ^Mozilla/5\.0 \(compatible; NFHSStreamMonitor — internal Playlist
#                                                  monitor. Would need a
#                                                  service-to-service
#                                                  token mint or an
#                                                  internal-only route
#                                                  bypass. Not urgent
#                                                  since it's ours;
#                                                  leave allowlisted.
#
#   ^nfhs-cc-api/                                — cc-api's httpx client
#                                                  for variant-playlist
#                                                  preroll fetches
#                                                  (playon/cc-api#48).
#                                                  Same category as
#                                                  the monitor above —
#                                                  internal service.
#
#    CrKey/[0-9]                                  — Chromecast receiver
#                                                  (VID-3581). Unanchored
#                                                  substring match — the
#                                                  Chromecast UA is a
#                                                  full Chrome/Safari UA
#                                                  with ` CrKey/…` at the
#                                                  tail (`Chrome/… Safari/…
#                                                  CrKey/1.56.500000`).
#                                                  Per Andy via Cody on
#                                                  VID-3505.
#
# See VID-3507 for the tracking ticket that gates the native-entry
# removal on each app team's path-segment integration.
#
# Regex escaping notes: `\.` and `\(` must be double-backslashed in JSON
# to survive the jsonencode() → CF Function template hop.
legacy_client_allowlist = [
  "^AppleCoreMedia/",
  "^NFHS Network/[0-9.]+ \\(Linux;Android",
  "^Roku/DVP-",
  "^Mozilla/5\\.0 \\(compatible; NFHSStreamMonitor",
  "^nfhs-cc-api/",
  " CrKey/[0-9]",
]

# VID-3581: DMA-blackout bypass allowlist. Same six patterns as
# legacy_client_allowlist to start — product direction (Robb Schuneman,
# 2026-08-18) is that any client on the token allowlist should also
# skip the 451 blackout gate during the transitional window, because
# none of them render a blackout-message UI to the viewer yet
# (VID-3507 tracks the per-app retirement of these entries).
#
# Rationale for including the internal-service entries (StreamMonitor,
# nfhs-cc-api) despite not being end-user surfaces: internal server-to-
# server probes shouldn't be subject to end-user regional restrictions.
# If cc-api's variant-fetch Lambda happens to land in a blacked-out
# metro, we don't want it to 451 on the fetch — that's not a viewer
# play, so the blackout doesn't apply.
#
# Chromecast (`CrKey/[0-9]`) is deliberately NOT on this list per
# Cody Meincke's PR #33 review: Chromecast receivers run a Chrome-based
# stack that can display arbitrary web UI, so blackout-message
# rendering is possible in principle. Until someone confirms whether
# our Cast receiver actually handles a 451 gracefully today, default
# to the tighter policy (DMA gate enforces on Chromecast). Add back
# only with a stated capability answer.
#
# Rights-compliance status: product direction captured above. If a
# formal sign-off is required, capture as a comment on VID-3581.
#
# Retirement: each entry sunsets when its app ships blackout-message
# UI. Prune from this list independently of the corresponding
# legacy_client_allowlist entry — the two lists have different exit
# criteria (token integration vs blackout UI shipping).
dma_bypass_allowlist = [
  "^AppleCoreMedia/",
  "^NFHS Network/[0-9.]+ \\(Linux;Android",
  "^Roku/DVP-",
  "^Mozilla/5\\.0 \\(compatible; NFHSStreamMonitor",
  "^nfhs-cc-api/",
]

# VID-3458: DMA blackout enforcement mode. Flipped to "enforce" after
# end-to-end smoke against a test broadcast (bdcc0ab49f6f9 with DMAs
# [524,602]) confirmed the full pipeline — sync-writer → KVS → validator
# → CloudWatch log — works in log mode. In enforce, blocked viewers get
# HTTP 451 "blackout_dma" with Cache-Control: no-store.
dma_enforcement_mode = "enforce"
