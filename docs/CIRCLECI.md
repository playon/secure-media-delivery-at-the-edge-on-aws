# CircleCI pipeline

Matches the video-team fleet convention used by `iac-tf-aws-project-video-common` and other `iac-tf-aws-*` repos (per Ion Popescu, [DO-1833](https://huddleinc.atlassian.net/browse/DO-1833)).

## Shape

**On every branch push** (including PR branches):

```
static-checks ─┐
               ├─→ plan-branch ─→ approve-stage-from-branch ─→ apply-stage-from-branch
unit-tests ────┘                       (optional manual click)
```

- `static-checks` — `terraform fmt -check` + `terraform init -backend=false` + `terraform validate`. No AWS creds. Halts cleanly on refs where `terraform/` isn't present.
- `unit-tests` — jest on the validator CloudFront Function.
- `plan-branch` — `terraform init` (with backend) → `terraform plan -out=tfplan.binary`. Uploads the plan as an artifact so reviewers see the exact diff. Read-only from AWS's perspective. Persists the plan workspace so a follow-on apply from the branch can consume it without re-planning.
- `approve-stage-from-branch` — **optional** manual gate. Only click if you want to apply THIS branch's plan to stage. Merges do not fire it. Skipping it costs nothing.
- `apply-stage-from-branch` — same job as `apply-stage`; attaches the workspace and runs `terraform apply tfplan.binary`. Leaf — no chain to prod from a branch.

**Cross-branch coordination:** there is no lock. Two feature branches can each approve stage-from-branch in parallel; whichever wins the terraform state lock first serializes, the second's plan may include the first's changes on next re-plan. Communicate before applying.

**On `main` push** (typically after PR merge):

```
static-checks → plan-main → approve-stage → apply-stage → approve-prod-plan → plan-prod → approve-prod-apply → apply-prod
```

- `plan-main` — same job as `plan-branch`, persists plan to the workflow workspace for the downstream apply.
- `approve-stage` — manual gate. Reviewer looks at the plan artifact before clicking.
- `apply-stage` — attaches the plan workspace and runs `terraform apply tfplan.binary`. Prints outputs.
- `approve-prod-plan` / `plan-prod` / `approve-prod-apply` / `apply-prod` — two approval gates around the prod plan itself so operators review the exact prod diff before anything mutates prod.

Prod is main-only. Branches cannot deploy to prod, regardless of approval clicks.

## AWS auth

CircleCI context `GOFAN_OPS` provides the runner AWS credentials (base session). The `aws` provider block in `terraform/providers.tf` then `assume_role`s into the per-repo deployer role:

```hcl
provider "aws" {
  assume_role {
    role_arn     = "arn:aws:iam::${local.account_id}:role/playon/iam/deployer/video/video-secure-media-delivery-at-the-edge-deployer"
    session_name = "terraform_aws"
  }
}
```

Same shape as `iac-tf-aws-project-video-common`'s deployer role. No OIDC provider, no `AssumeRoleWithWebIdentity`, no `CIRCLE_OIDC_TOKEN`.

## Deployer role provisioning

The `secure-media-delivery-at-the-edge-deployer` role is provisioned via the video-team's IAC repo (specific repo TBD — see [DO-1833](https://huddleinc.atlassian.net/browse/DO-1833) thread). Permissions scoped to the resource types this stack manages:

- `wafv2:*` — Web ACL for `/api/token` rate limiting
- `cloudfront:*`, `cloudfront-keyvaluestore:*` — Distribution, functions, KVS
- `lambda:*` — 6 Lambdas (mint x3, revoke, list-revoked, kvs-cleanup) + rotation sync
- `apigateway:*` — REST API + 5 resources
- `secretsmanager:*` on `cta-secure-media-*` — HMAC signing key
- `states:*`, `events:*`, `scheduler:*` — Step Functions rotation + EventBridge schedule
- `iam:*Role*`, `iam:*Policy*`, `iam:PassRole` on `cta-secure-media-*` — for Lambda execution roles
- `s3:*` on the demo bucket
- `kinesis:*` on the realtime-logs stream

Backend state assume-role (unchanged from every other TF repo):

```
arn:aws:iam::938096786822:role/playon/cloudengineering/PlayOn-IacTerraformBackends
```

## Prereqs before first apply

- CircleCI project enabled on `playon/secure-media-delivery-at-the-edge-on-aws` (Org UUID `7977265f-fff8-4794-b8aa-b86b11ae1eb7`, Project UUID `79321557-ab72-4422-9ccd-d7f579db2f1a`)
- `GOFAN_OPS` context available to the org (it is — every video-team repo uses it)
- Deployer role provisioned via the IAC repo
- CDK stack `CTASecureMedia` destroyed before the first TF apply to avoid resource-name conflicts:

  ```sh
  aws cloudformation delete-stack --stack-name CTASecureMedia \
    --profile nfhsnet_stage_admin --region us-east-1
  ```
