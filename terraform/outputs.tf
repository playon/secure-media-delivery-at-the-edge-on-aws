output "kvs_arn" {
  description = "CloudFront KeyValueStore ARN. Referenced by any consumer that wants to attach a CloudFront Function reading from this KVS."
  value       = aws_cloudfront_key_value_store.this.arn
}

output "kvs_id" {
  description = "CloudFront KeyValueStore ID."
  value       = aws_cloudfront_key_value_store.this.id
}

output "validator_function_arn" {
  description = "CTA validator CloudFront Function ARN. Cross-repo reference target for playon/iac-tf-aws-project-video-common#hls-cloudfront."
  value       = aws_cloudfront_function.validator.arn
}

output "signing_secret_arn" {
  description = "Secrets Manager secret ARN holding the HMAC signing key. Referenced by the (still-to-be-ported) mint Lambdas."
  value       = aws_secretsmanager_secret.signing_key.arn
}
