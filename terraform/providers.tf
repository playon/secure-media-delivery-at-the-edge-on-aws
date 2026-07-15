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

  # Local dev: assume this role via the AWS SSO profile the developer is
  # already logged into (nfhsnet_stage_admin for stage). CI (once wired)
  # will use the OIDC role from DO-1833 or equivalent.
  #
  # Not using an assume_role block here since the caller identity varies
  # (SSO admin locally, OIDC in CI); let the AWS SDK's default credential
  # chain resolve.

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Repo        = "github.com:playon/secure-media-delivery-at-the-edge-on-aws.git"
      Application = "cta-secure-media"
      Environment = var.environment
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
