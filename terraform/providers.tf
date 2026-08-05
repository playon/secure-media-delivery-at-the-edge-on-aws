terraform {
  required_version = "~> 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.88"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Backend matches the pattern used by playon/iac-tf-aws-project-video-common:
  # shared state bucket in playon-shared account, per-repo key, workspace-per-env.
  # See VID-3439 for the port context.
  backend "s3" {
    dynamodb_table = "terraform-locks-938096786822-us-east-1"
    bucket         = "terraform-backends-938096786822-us-east-1"
    key            = "playon/video/secure-media-delivery-at-the-edge-on-aws"
    region         = "us-east-1"
    assume_role = {
      role_arn = "arn:aws:iam::938096786822:role/playon/cloudengineering/PlayOn-IacTerraformBackends"
    }
  }
}

provider "aws" {
  region = var.region

  # Video-team convention (per Ion Popescu on DO-1833): CircleCI GOFAN_OPS
  # context supplies the base runner creds; provider assume_role's into a
  # per-repo deployer role. Same shape as iac-tf-aws-project-video-common.
  #
  # Local dev: the developer's SSO session (nfhsnet_stage_admin) must be
  # allowed to assume this role. If not, CI is the intended path.
  assume_role {
    role_arn     = "arn:aws:iam::${var.account_id}:role/playon/iam/deployer/video/video-secure-media-delivery-at-the-edge-deployer"
    session_name = "terraform_aws"
  }

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Repo        = "github.com:playon/secure-media-delivery-at-the-edge-on-aws.git"
      Application = "cta-secure-media"
      Environment = var.environment
    }
  }

  # VID-3484: Cloud Custodian applies its own tag set out-of-band
  # (`domain`, `environment` [lowercase], `owned-by`, `project`, `region`).
  # We don't own those keys; TF was stripping them on every apply, and
  # Custodian was re-applying on its next sweep — infinite drift cycle.
  # `ignore_tags` tells TF to leave them alone across every resource
  # managed by this provider. Our uppercase default_tags above stay
  # authoritatively owned by us.
  ignore_tags {
    keys = ["domain", "environment", "owned-by", "project", "region"]
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
