# API Gateway REST API — token mint (Node), revoke, list-revoked.
#
# The CDK stack disables the auto-created AWS::ApiGateway::Account resource
# (SCP blocks apigateway:PATCH on /account). TF's aws_api_gateway_rest_api
# does NOT create an Account resource, so we don't need the workaround.
#
# VID-3449: POST /token is IAM-gated when var.drm_api_lambda_role_arn is
# set. In stage, the drm-api-lambda execution role becomes the only
# principal allowed to mint tokens — no anonymous mint surface exists.

locals {
  # Present the token route with AWS_IAM auth when a caller ARN is
  # configured. Reference-solution behavior (NONE) is preserved for envs
  # that don't set the variable, so this stays a safe roll-out toggle.
  token_authorization = var.drm_api_lambda_role_arn != "" ? "AWS_IAM" : "NONE"
}

resource "aws_api_gateway_rest_api" "this" {
  name        = "${local.name_prefix}-${local.env_slug}"
  description = "CTA Token API. VID-3439."

  endpoint_configuration {
    types = ["EDGE"]
  }

  # VID-3449: resource policy restricts invoke on POST /token to the
  # drm-api-lambda role. AWS_IAM auth on the method + this policy = only
  # calls signed by that role's temporary creds reach the integration.
  # Everything else (revoke, revoked) stays open on the resource-policy
  # dimension (they're still individually AuthN'd if we add that later).
  policy = var.drm_api_lambda_role_arn == "" ? null : jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowDrmApiLambdaToMint"
        Effect    = "Allow"
        Principal = { AWS = var.drm_api_lambda_role_arn }
        Action    = "execute-api:Invoke"
        Resource  = "execute-api:/*/POST/token"
      },
      {
        Sid       = "AllowAnyToRevocationEndpoints"
        Effect    = "Allow"
        Principal = "*"
        Action    = "execute-api:Invoke"
        Resource = [
          "execute-api:/*/POST/revoke",
          "execute-api:/*/GET/revoked",
        ]
      },
    ]
  })
}

# --- /token → generator (Node) -----------------------------------------

resource "aws_api_gateway_resource" "token" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "token"
}

resource "aws_api_gateway_method" "token_post" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.token.id
  http_method   = "POST"
  authorization = local.token_authorization
}

resource "aws_api_gateway_integration" "token_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.token.id
  http_method             = aws_api_gateway_method.token_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.generator.invoke_arn
}

resource "aws_lambda_permission" "token_apigw" {
  statement_id  = "AllowAPIGatewayInvokeToken"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generator.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/POST/token"
}

# --- /revoke -----------------------------------------------------------

resource "aws_api_gateway_resource" "revoke" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "revoke"
}

resource "aws_api_gateway_method" "revoke_post" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.revoke.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "revoke_post" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.revoke.id
  http_method             = aws_api_gateway_method.revoke_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.revoker.invoke_arn
}

resource "aws_lambda_permission" "revoke_apigw" {
  statement_id  = "AllowAPIGatewayInvokeRevoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.revoker.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/POST/revoke"
}

# --- /revoked (GET) ----------------------------------------------------

resource "aws_api_gateway_resource" "revoked" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "revoked"
}

resource "aws_api_gateway_method" "revoked_get" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  resource_id   = aws_api_gateway_resource.revoked.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "revoked_get" {
  rest_api_id             = aws_api_gateway_rest_api.this.id
  resource_id             = aws_api_gateway_resource.revoked.id
  http_method             = aws_api_gateway_method.revoked_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.list_revoked.invoke_arn
}

resource "aws_lambda_permission" "revoked_apigw" {
  statement_id  = "AllowAPIGatewayInvokeRevoked"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_revoked.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.this.execution_arn}/*/GET/revoked"
}

# --- Deployment + stage ------------------------------------------------

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  # Triggers redeploy on any change to routes/methods/integrations. Also
  # hash the resource policy + token method authorization so flipping
  # VID-3449 forces a fresh deployment out to the stage.
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_rest_api.this.policy,
      aws_api_gateway_resource.token.id,
      aws_api_gateway_method.token_post.id,
      aws_api_gateway_method.token_post.authorization,
      aws_api_gateway_integration.token_post.id,
      aws_api_gateway_resource.revoke.id,
      aws_api_gateway_method.revoke_post.id,
      aws_api_gateway_integration.revoke_post.id,
      aws_api_gateway_resource.revoked.id,
      aws_api_gateway_method.revoked_get.id,
      aws_api_gateway_integration.revoked_get.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  deployment_id = aws_api_gateway_deployment.this.id
  stage_name    = "prod"
}
