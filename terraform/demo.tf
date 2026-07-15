# S3 demo bucket + upload of resources/demo-website/.
#
# Only useful in stage/dev; prod deployment sets var.enable_demo = false
# and skips this file's resources entirely (well, TF doesn't have per-file
# gating — the resources here are unconditional, but the tfvars for prod
# should override with an empty upload or a separate module.)
#
# For stage this MVP just deploys the demo files as-is. Dashboard is
# not included in this port (was optional in the CDK stack too).

resource "aws_s3_bucket" "demo" {
  bucket_prefix = "${local.name_prefix}-${local.env_slug}-demo-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "demo" {
  bucket                  = aws_s3_bucket.demo.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "demo" {
  name                              = "${local.name_prefix}-${local.env_slug}-demo-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "demo_bucket_policy" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.demo.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "demo" {
  bucket = aws_s3_bucket.demo.id
  policy = data.aws_iam_policy_document.demo_bucket_policy.json
}

# Upload every file under resources/demo-website/ to s3://<bucket>/website/
resource "aws_s3_object" "demo_files" {
  for_each = fileset("${path.module}/../source/resources/demo-website", "**/*")

  bucket = aws_s3_bucket.demo.id
  key    = "website/${each.value}"
  source = "${path.module}/../source/resources/demo-website/${each.value}"
  etag   = filemd5("${path.module}/../source/resources/demo-website/${each.value}")

  content_type = lookup(
    {
      "html" = "text/html"
      "css"  = "text/css"
      "js"   = "application/javascript"
      "json" = "application/json"
      "png"  = "image/png"
      "jpg"  = "image/jpeg"
      "svg"  = "image/svg+xml"
    },
    element(reverse(split(".", each.value)), 0),
    "application/octet-stream"
  )
}
