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
variable "drm_api_lambda_role_arn" {
  type        = string
  description = "ARN of the drm-api-lambda execution role. When non-empty, flips POST /api/token to AWS_IAM authorization and installs a resource policy allowing invoke only from this role."
  default     = ""
  nullable    = false
}
