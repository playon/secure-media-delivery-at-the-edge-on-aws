# Terraform port of CTASecureMedia — VID-3439

Terraform replacement for the CDK stack in `source/`. Aligns with PlayOn's
[Engineering Standards](https://huddleinc.atlassian.net/wiki/spaces/EO/pages/5233705013/Engineering+Standards)
which require Terraform for IaC.

Lambda source (`source/lambda/`, `source/lambda-python/`, `source/lambda-ruby/`)
and the CloudFront Function validator (`source/lambda/cta_token_validator.js`)
stay put — TF references them in-repo via
`file("${path.module}/../source/lambda/...")`. No vendoring, no drift.

## Layout

```
terraform/
├── providers.tf         # AWS + random providers, S3 backend
├── variables.tf         # env-agnostic inputs
├── main.tf              # KVS + signing secret + validator function
├── lambda.tf            # mint/revoke/list-revoked/kvs-cleanup + IAM
├── rotation.tf          # SyncKeysToKvs + Step Functions + EventBridge + initial-sync
├── apigateway.tf        # REST API + resources + methods + deployment
├── waf.tf               # WAFv2 Web ACL (rate limit)
├── distribution.tf      # CloudFront distribution + api-path-rewriter + Kinesis realtime logs
├── demo.tf              # S3 demo bucket + files upload
├── outputs.tf           # cross-repo consumers grab function_arn from here
└── envs/
    └── nfhs-staging-us-east-1.tfvars
```

## Prereq: install Node lambda deps before apply

The Node Lambda (`source/lambda/`) declares `cbor-x` + `@aws-sdk/*` in
`package.json` but ships them via `node_modules/`. `archive_file` zips
the folder as-is, so those modules must be installed first:

```sh
npm install --omit=dev --no-audit --no-fund --prefix source/lambda
npm install --omit=dev --no-audit --no-fund --prefix source/lambda/sync_keys
```

Python + Ruby lambdas are stdlib-only, no equivalent step needed.

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
chain resolve. CI wiring lands separately (rewrite of the fork's CircleCI
PR #1).

## Port status

### Landed
- [x] `aws_cloudfront_key_value_store` — fresh KVS
- [x] `aws_secretsmanager_secret` — HMAC signing key
- [x] `aws_cloudfront_function` — CTA validator (references `../source/lambda/cta_token_validator.js`)
- [x] `aws_cloudfront_function` — api-path-rewriter (inline JS, strips `/api/` prefix before APIGW)
- [x] `aws_wafv2_web_acl` — rate-limit rule on `/api/token` (300/5min, custom 429 body)
- [x] `aws_lambda_function` × 6 — generator (Node/Python/Ruby), revoker, list_revoked, kvs_cleanup
- [x] `aws_lambda_function` × 1 — sync_keys (rotation Lambda)
- [x] IAM roles + policies for all 7 Lambdas (KVS read/write, Secrets read, logs)
- [x] `aws_api_gateway_rest_api` + 5 resources + methods + deployment + prod stage
- [x] `aws_lambda_permission` × 5 wiring APIGW → each Lambda
- [x] `aws_sfn_state_machine` — key rotation workflow (retry policy matches CDK)
- [x] `aws_cloudwatch_event_rule` × 2 + role — rotation schedule + hourly KVS cleanup
- [x] `aws_kinesis_stream` + IAM + `aws_cloudfront_realtime_log_config`
- [x] `aws_cloudfront_distribution` — WAF + real-time logs + validator + api-rewriter + demo origins
- [x] `aws_s3_bucket` demo + OAC + bucket policy + file upload from `source/resources/demo-website/`
- [x] `aws_lambda_invocation` (initial key sync) — TF-native replacement for the CDK `KeySync` custom resource; re-runs when the secret version changes

### Explicit non-goals for this ticket
- Bedrock Nova Lite auto-revocation (deferred to [VID-3425 / CTA-9](https://huddleinc.atlassian.net/browse/VID-3425); currently disabled in the CDK config)
- Prod deployment (stage-only; prod cutover follows soak)
- Dashboard S3 upload (was optional in CDK too — can add later)
- Any change to the Lambda source or validator JS — pure IaC swap

## Consumer wiring

Once VID-3439 lands, [video-common PR #40](https://github.com/playon/iac-tf-aws-project-video-common/pull/40)
(VID-3419) refactors to:

1. Delete its vendored `functions/cta_token_validator.js`
2. Delete its `aws_cloudfront_function.cta_validator` resource
3. Delete its `cta_validator_kvs_arn` variable
4. Replace with `cta_validator_function_arn = "<arn from terraform output>"`

Cross-repo surface becomes one ARN string. No vendoring, no cross-tool coupling.

## Cutover from CDK

New TF stack stands up alongside the existing CDK stack (different names).
Once smoke tests pass on the TF stack:

1. Update `hls.bcast.stage` (in video-common) to reference the new validator function ARN
2. Point any external consumers (players, docs) at the new `api_endpoint` output
3. `aws cloudformation delete-stack --stack-name CTASecureMedia` on the CDK stack
4. Delete `source/` from this repo

## Related

- [VID-3439](https://huddleinc.atlassian.net/browse/VID-3439) — this port
- [VID-3417](https://huddleinc.atlassian.net/browse/VID-3417) — original CDK deploy
- [VID-3419](https://huddleinc.atlassian.net/browse/VID-3419) — CTA-3 (consumer wiring on hls.bcast, currently PR #40 in video-common)
- [Engineering Standards](https://huddleinc.atlassian.net/wiki/spaces/EO/pages/5233705013/Engineering+Standards)
