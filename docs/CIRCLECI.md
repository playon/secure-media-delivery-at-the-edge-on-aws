# CircleCI pipeline

## Shape

**On every branch push** (including PR branches):

```
static-checks → plan-branch  (PR branches only)
```

- `static-checks` — `terraform fmt -check` + `terraform init -backend=false` + `terraform validate`. No AWS creds.
- `plan-branch` — assumes the stage OIDC role, `terraform init` (with backend), `terraform plan -out=tfplan.binary`. Uploads the plan as an artifact so reviewers see the exact diff. Read-only from AWS's perspective; doesn't chain into apply.

**On `cwt` push** (typically after PR merge):

```
static-checks → plan-cwt → approve-stage → apply-stage → approve-prod → apply-prod
```

- `plan-cwt` — same job as `plan-branch`, persists plan to the workflow workspace for the downstream apply.
- `approve-stage` — manual gate. Reviewer looks at the plan artifact before clicking.
- `apply-stage` — attaches the plan workspace and runs `terraform apply tfplan.binary`. Prints outputs.
- `approve-prod` / `apply-prod` — placeholder for the prod cutover. Currently a no-op that just logs a note; wire the real apply step (and `PLAYON_VIDEO_AWS_PROD` context) when we're ready.

## AWS auth (OIDC)

The plan and apply jobs exchange `$CIRCLE_OIDC_TOKEN` for temporary AWS credentials via `sts:AssumeRoleWithWebIdentity`. No static AWS keys live in CircleCI.

CircleCI contexts inject the target role ARN:

| Context | Env var | Trusts |
|---|---|---|
| `PLAYON_VIDEO_AWS_STAGE` | `CTA_AWS_STAGE_ROLE_ARN` | CircleCI project `playon/secure-media-delivery-at-the-edge-on-aws`, any branch. Apply is workflow-gated to `cwt`; branches can only plan (read-only). |
| `PLAYON_VIDEO_AWS_PROD` | `CTA_AWS_PROD_ROLE_ARN` | Same, when prod is wired |

## IAM role provisioning (DO ticket)

Each account (stage first, prod later) needs:

**1. OIDC identity provider** — one per account, already present if any other CircleCI-managed workload uses OIDC in the account. Provider URL:

```
https://oidc.circleci.com/org/7977265f-fff8-4794-b8aa-b86b11ae1eb7
```

Client ID: `7977265f-fff8-4794-b8aa-b86b11ae1eb7`

**2. IAM role** — one per account. Suggested name: `ctaSecureMediaCircleCIDeploy`.

Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT>:oidc-provider/oidc.circleci.com/org/7977265f-fff8-4794-b8aa-b86b11ae1eb7"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "oidc.circleci.com/org/7977265f-fff8-4794-b8aa-b86b11ae1eb7:aud": "7977265f-fff8-4794-b8aa-b86b11ae1eb7"
      },
      "StringLike": {
        "oidc.circleci.com/org/7977265f-fff8-4794-b8aa-b86b11ae1eb7:sub": "org/7977265f-fff8-4794-b8aa-b86b11ae1eb7/project/79321557-ab72-4422-9ccd-d7f579db2f1a/user/*/vcs-origin/github.com/playon/secure-media-delivery-at-the-edge-on-aws/vcs-ref/refs/heads/*"
      }
    }
  }]
}
```

The `sub` claim scoping locks the role to the fork's project — any branch on this repo can assume it (needed so PR branches can run `terraform plan` for review artifacts). A different repo cannot. Apply-capable jobs stay gated to `cwt` at the workflow level; plan is read-only from AWS's perspective.

**Permissions**: the role runs `terraform plan` / `terraform apply` directly against the AWS API. Two things it needs:

1. Assume the shared backend state role:

```json
{
  "Sid": "TerraformStateBackend",
  "Effect": "Allow",
  "Action": "sts:AssumeRole",
  "Resource": "arn:aws:iam::938096786822:role/playon/cloudengineering/PlayOn-IacTerraformBackends"
}
```

2. Direct permissions for CTA resources:

```json
{
  "Sid": "CTAResources",
  "Effect": "Allow",
  "Action": [
    "cloudfront:*",
    "cloudfront-keyvaluestore:*",
    "wafv2:*",
    "lambda:*",
    "apigateway:*",
    "secretsmanager:*",
    "kinesis:*",
    "states:*",
    "events:*",
    "scheduler:*",
    "iam:*Role*",
    "iam:*Policy*",
    "iam:PassRole",
    "iam:*InstanceProfile*",
    "s3:*"
  ],
  "Resource": "*"
}
```

`Resource: *` because Terraform creates resources whose names include random suffixes; scoping to a name prefix would break on rename. Same pattern as `video-iac-tf-aws-project-video-common-deployer`.

**Alternative** (cleaner if DevOps prefers): reuse the existing `video-iac-tf-aws-project-video-common-deployer` role — extend its trust to include this repo's OIDC principal. Fewer moving parts, one deployer for all video-team TF.
