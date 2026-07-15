# Terraform port of CTASecureMedia — VID-3439

Terraform replacement for the CDK stack in `source/`. Aligns with PlayOn's
[Engineering Standards](https://huddleinc.atlassian.net/wiki/spaces/EO/pages/5233705013/Engineering+Standards)
which requires Terraform for IaC.

The Lambda source (`lambda/`, `lambda-python/`, `lambda-ruby/`) and CloudFront
Function code (`lambda/cta_token_validator.js`) stay put — TF references them
in-repo via `file("${path.module}/../lambda/...")`. No vendoring, no drift.

## Layout

```
terraform/
├── providers.tf         # AWS provider + S3 backend (shared with video-common)
├── variables.tf         # env-agnostic inputs
├── main.tf              # resources
├── outputs.tf           # KVS + function ARNs for cross-repo consumers
└── envs/
    └── nfhs-staging-us-east-1.tfvars
```

## Usage

Same pattern as `iac-tf-aws-project-video-common`:

```sh
cd terraform
export TF_WORKSPACE=nfhs-staging-us-east-1
terraform init
terraform workspace new $TF_WORKSPACE || terraform workspace select $TF_WORKSPACE
terraform plan -var-file=envs/$TF_WORKSPACE.tfvars
terraform apply -var-file=envs/$TF_WORKSPACE.tfvars
```

Local runs: SSO into `nfhsnet_stage_admin` and let the default AWS credential
chain resolve. CI wiring lands separately (rewrite of CircleCI PR #1).

## Port status

### Landed
- [x] `aws_cloudfront_key_value_store` — fresh KVS (stage cutover invalidates old tokens per Will's call)
- [x] `aws_secretsmanager_secret` — HMAC signing key with generated random value
- [x] `aws_cloudfront_function` — CTA validator, references `../lambda/cta_token_validator.js`, associated to KVS

### Still to port (from `source/lib/cta-secure-media-stack.ts`)
- [ ] WAFv2 Web ACL — rate rule on `/api/token` (300/5min, custom 429 body)
- [ ] API Gateway REST API — `/token`, `/token-python`, `/token-ruby`, `/revoke`, `/revoked`
- [ ] Lambda functions: `CTAGenerator`, `CTAGeneratorPython`, `CTAGeneratorRuby`, `CTARevoker`, `ListRevoked`, `KvsCleanup`
- [ ] Lambda execution IAM roles + policies
- [ ] Step Functions rotation state machine
- [ ] EventBridge Scheduler for rotation
- [ ] Kinesis real-time log stream + IAM + `CfnRealtimeLogConfig`
- [ ] CloudFront Distribution (with WAF, real-time logs, `api-path-rewriter` function on `/api/*`)
- [ ] S3 demo bucket + `aws_s3_object` upload of `resources/demo-website/`
- [ ] TF-native replacement for the CDK `KeySync` custom resource (populates KVS with initial signing key on first apply)

### Explicit non-goals
- Bedrock Nova Lite auto-revocation (deferred to [VID-3425 / CTA-9](https://huddleinc.atlassian.net/browse/VID-3425); currently disabled in the CDK config too)
- Prod deployment (this ticket lands stage; prod cutover follows soak)
- Any change to the Lambda source or validator JS — pure IaC swap

## Consumer wiring

Once VID-3439 lands, [video-common PR #40](https://github.com/playon/iac-tf-aws-project-video-common/pull/40)
(VID-3419) refactors to:

1. Delete its vendored `functions/cta_token_validator.js`
2. Delete its `aws_cloudfront_function.cta_validator` resource
3. Delete its `cta_validator_kvs_arn` variable
4. Replace with `cta_validator_function_arn = "arn:aws:cloudfront::877726356953:function/cta-secure-media-staging-validator"`

Cross-repo surface becomes one ARN string.

## Related

- [VID-3439](https://huddleinc.atlassian.net/browse/VID-3439) — this port
- [VID-3417](https://huddleinc.atlassian.net/browse/VID-3417) — original CDK deploy
- [VID-3419](https://huddleinc.atlassian.net/browse/VID-3419) — CTA-3 (consumer wiring on hls.bcast)
- [Engineering Standards](https://huddleinc.atlassian.net/wiki/spaces/EO/pages/5233705013/Engineering+Standards)
