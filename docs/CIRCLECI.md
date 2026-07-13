# CircleCI pipeline

## Shape

Every push to `cwt` runs:

```
test → synth → approve-stage → deploy-stage → approve-prod → deploy-prod
```

`test` and `synth` run automatically. `approve-stage` and `approve-prod`
are manual gates. `deploy-prod` is a placeholder no-op until CTA moves
past the initial stage-only rollout — it exists so the workflow shape
matches the other video-team services and prod wiring is a one-file
change when we're ready.

## AWS auth (OIDC)

Deploy jobs exchange `$CIRCLE_OIDC_TOKEN` for temporary AWS credentials
via `sts:AssumeRoleWithWebIdentity`. No static AWS keys live in
CircleCI.

Two CircleCI contexts inject the target role ARN as `CTA_AWS_STAGE_ROLE_ARN`
and (later) `CTA_AWS_PROD_ROLE_ARN`:

| Context | Env var | Trusts |
|---|---|---|
| `PLAYON_VIDEO_AWS_STAGE` | `CTA_AWS_STAGE_ROLE_ARN` | CircleCI project `playon/secure-media-delivery-at-the-edge-on-aws`, branch `cwt` |
| `PLAYON_VIDEO_AWS_PROD` | `CTA_AWS_PROD_ROLE_ARN` | Same, when prod is wired |

## IAM role provisioning (DO ticket)

Each account (stage first, prod later) needs:

**1. OIDC identity provider** — one per account, already present if any
other CircleCI-managed workload uses OIDC in the account. Provider URL:

```
https://oidc.circleci.com/org/<PLAYON_CIRCLECI_ORG_UUID>
```

Client ID: `<PLAYON_CIRCLECI_ORG_UUID>`

**2. IAM role** — one per account. Suggested name: `ctaSecureMediaCircleCIDeploy`.

Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::<ACCOUNT>:oidc-provider/oidc.circleci.com/org/<PLAYON_CIRCLECI_ORG_UUID>"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "oidc.circleci.com/org/<PLAYON_CIRCLECI_ORG_UUID>:aud": "<PLAYON_CIRCLECI_ORG_UUID>"
      },
      "StringLike": {
        "oidc.circleci.com/org/<PLAYON_CIRCLECI_ORG_UUID>:sub": "org/<PLAYON_CIRCLECI_ORG_UUID>/project/<PLAYON_CIRCLECI_PROJECT_UUID>/user/*/vcs-origin/github.com/playon/secure-media-delivery-at-the-edge-on-aws/vcs-ref/refs/heads/cwt"
      }
    }
  }]
}
```

The `sub` claim scoping locks the role to the fork's `cwt` branch — a
PR branch or a different repo cannot assume it.

Permissions: the CDK app is already bootstrapped in stage. The CI role
only needs to assume the CDK bootstrap roles:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": [
      "arn:aws:iam::<ACCOUNT>:role/cdk-hnb659fds-deploy-role-<ACCOUNT>-us-east-1",
      "arn:aws:iam::<ACCOUNT>:role/cdk-hnb659fds-file-publishing-role-<ACCOUNT>-us-east-1",
      "arn:aws:iam::<ACCOUNT>:role/cdk-hnb659fds-image-publishing-role-<ACCOUNT>-us-east-1",
      "arn:aws:iam::<ACCOUNT>:role/cdk-hnb659fds-lookup-role-<ACCOUNT>-us-east-1"
    ]
  }]
}
```

The CDK bootstrap roles carry the actual CloudFormation / Lambda / IAM
PassRole / etc permissions — this keeps our CI role minimal.
