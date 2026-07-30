variable "account_id" {
  type        = string
  description = "Target AWS account id. Guards against workspace/tfvars mismatch."
  nullable    = false
}

variable "region" {
  type        = string
  description = "AWS region for all resources."
  default     = "us-east-1"
  nullable    = false
}

variable "environment" {
  type        = string
  description = "Deployment environment (nfhs-staging | nfhs-prod)."
  nullable    = false
}

variable "name_prefix" {
  type        = string
  description = "Prefix for named resources (function, key group, WebACL, etc.)."
  default     = "cta-secure-media"
  nullable    = false
}

variable "signing_key_length" {
  type        = number
  description = "HMAC signing key length. 64 matches the CDK reference solution."
  default     = 64
  nullable    = false
}

variable "rotation_schedule" {
  type        = string
  description = "EventBridge schedule expression for the signing-key rotation Step Function. Default matches the CDK stack's 30-day cadence."
  default     = "rate(30 days)"
  nullable    = false
}

variable "demo_origin_domain" {
  type        = string
  description = "Default-behavior origin domain. Stage default matches the CDK reference solution's demo playback host. Override in prod tfvars to point at real content origin."
  default     = "cdn.mediaplaypen.com"
  nullable    = false
}

# VID-3449: gate POST /api/token to IAM-authenticated callers so the only
# way to mint a CWT is through drm-api-lambda (which does entitlement
# checks against member-service). Anonymous callers hit 403 at APIGW.
#
# Empty string keeps the reference-solution behavior (authorization = NONE,
# anyone can mint). Set to the drm-api-lambda execution role ARN in envs
# that participate in the CTA-5007-B rollout; the REST API resource policy
# then restricts invoke to that role alone.
variable "unity_api_base" {
  type        = string
  description = "Base URL of unity-api used by the blackout sync-writer (VID-3459). E.g. https://unity.nfhsnetwork.com — the Lambda hits /v2/broadcasts under this base. Read endpoints are anonymous; no credential threaded through."
  nullable    = false
}

# VID-3458: per-broadcast DMA blackout enforcement at the CloudFront
# edge via the sync-writer's KVS entries (VID-3459). Independent of
# token validation — DMA check runs even in break-glass mode.
variable "dma_enforcement_mode" {
  type        = string
  description = "DMA blackout enforcement mode. 'off' skips the check entirely (zero KVS lookups per request). 'log' computes the block decision and emits a CloudWatch log line but always forwards — useful for measuring the population that WOULD be blocked before flipping to enforce. 'enforce' rejects blocked viewers with 451 Unavailable For Legal Reasons and body 'blackout_dma'."
  default     = "off"
  nullable    = false

  validation {
    condition     = contains(["off", "log", "enforce"], var.dma_enforcement_mode)
    error_message = "dma_enforcement_mode must be one of: off, log, enforce."
  }
}

variable "drm_api_lambda_role_arn" {
  type        = string
  description = "ARN of the drm-api-lambda execution role. When non-empty, flips POST /api/token to AWS_IAM authorization and installs a resource policy allowing invoke only from this role."
  default     = ""
  nullable    = false
}

# VID-3464: transitional User-Agent allowlist. Legacy native app installs
# (iOS, Android, tvOS, Roku) can't ship CTA-minting builds on the prod
# cutover date, and a hard flip blacks them out. Patterns here are
# regex strings matched against the viewer User-Agent header at the
# CTA validator; matches bypass token validation entirely. See
# docs/plans/vid-3457-ua-allowlist.md (live-cc-service repo) for the
# threat-model + sunset criterion.
variable "legacy_client_allowlist" {
  type        = list(string)
  description = "Regex patterns matched against the viewer User-Agent. Requests whose UA matches ANY pattern bypass CTA token validation. Order: after DMA blackout, before token check. Keep list small (< 20 entries) — matcher is linear per request. Empty list disables the bridge."
  default     = []
  nullable    = false

  # Guard against a bad regex bricking the edge. new RegExp(...) runs at
  # CloudFront-Function-init on every invocation; an uncompilable pattern
  # throws before we reach the handler and every viewer request 5xxs.
  # Terraform's `regex` is RE2, which is stricter than JS (no lookaheads,
  # etc.), so this catches obvious syntax errors at plan time. Patterns
  # here are anchored literal prefixes — RE2 handles them fine.
  validation {
    condition     = alltrue([for p in var.legacy_client_allowlist : can(regex(p, ""))])
    error_message = "Each legacy_client_allowlist entry must be a valid RE2 regex (empirically also a valid JS RegExp for the anchored-literal patterns we use)."
  }
}

# VID-3464: token-check enforcement mode. Parallel shape to
# dma_enforcement_mode. Single knob covers what was previously split
# between token_validation_enabled (bool) and enforcement mode.
variable "token_enforcement_mode" {
  type        = string
  description = "CTA token validation mode. 'off' skips the check entirely — the validator forwards every viewer request without inspecting the token (break-glass bypass; DMA enforcement still runs). 'log' runs the check and emits a Kinesis/CloudWatch log line on failure but forwards anyway — measures the population that WOULD be blocked before flipping to enforce. 'enforce' rejects with 401 (missing/invalid/expired) or 410 (revoked). DMA blackout enforcement is independent (dma_enforcement_mode)."
  default     = "enforce"
  nullable    = false

  validation {
    condition     = contains(["off", "log", "enforce"], var.token_enforcement_mode)
    error_message = "token_enforcement_mode must be one of: off, log, enforce."
  }
}
