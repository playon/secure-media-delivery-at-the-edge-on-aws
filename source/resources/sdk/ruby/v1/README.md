# AWS Secure Media Delivery Ruby SDK

Ruby SDK for the Secure Media Delivery at the Edge on AWS Solution.

> **⚠️ Development Status**: This Ruby SDK is currently under active development. While it provides full feature parity with the Node.js version, the **Node.js SDK is considered the most stable and production-ready** implementation at this time. Please use the Node.js SDK for production workloads until this Ruby version reaches stable release.

## Installation

Add this line to your application's Gemfile:

```ruby
gem 'aws-secure-media-delivery'
```

And then execute:

```bash
bundle install
```

Or install it yourself as:

```bash
gem install aws-secure-media-delivery
```

## Usage

### Basic Token Generation

```ruby
require 'aws_secure_media_delivery'

# Initialize secret manager
secret = AwsSecureMediaDelivery::Secret.new(stack_name: 'MyStack', ttl: 300)
secret.init_sm_client

# Create token generator
token = AwsSecureMediaDelivery::Token.new(secret)

# Define viewer attributes
viewer_attributes = {
  ip: '192.168.1.1',
  co: 'US',
  headers: {
    'user-agent' => 'Mozilla/5.0...',
    'referer' => 'https://example.com'
  }
}

# Define token policy
token_policy = {
  ip: true,
  co: true,
  headers: ['user-agent', 'referer'],
  paths: ['/video/'],
  exp: '+2h'
}

# Generate token
playback_url = 'https://example.cloudfront.net/video/stream.m3u8'
signed_url = token.generate(viewer_attributes, playback_url, token_policy)
puts signed_url
```

### Session Management

```ruby
# Initialize session management
AwsSecureMediaDelivery::Session.initialize('MyRevocationTable')

# Create and revoke a session
session = AwsSecureMediaDelivery::Session.new('session123')
success = session.revoke(expiry_period: 86400, reason: 'COMPROMISED')
```

### Custom Secret Retrieval

```ruby
custom_retriever = proc do |stack_name|
  # Your custom logic to retrieve secrets
  {
    primary: {
      uuid: 'key-uuid',
      value: 'secret-value'
    }
  }
end

secret = AwsSecureMediaDelivery::Secret.new(
  stack_name: 'MyStack',
  ttl: 300,
  retrieve_mode: :custom,
  retrieve_function: custom_retriever,
  retrieve_function_args: ['MyStack']
)
```

## Classes

### Secret
Manages cryptographic secrets for token signing.

### Token
Generates JWT tokens with various security policies.

### Session
Manages session revocation and tracking.

## Requirements

- Ruby 2.7+
- aws-sdk-secretsmanager
- aws-sdk-dynamodb
- jwt
- ipaddr
- concurrent-ruby

## Development

After checking out the repo, run `bin/setup` to install dependencies. Then, run `rake spec` to run the tests. You can also run `bin/console` for an interactive prompt that will allow you to experiment.

To install this gem onto your local machine, run `bundle exec rake install`. To release a new version, update the version number in `version.rb`, and then run `bundle exec rake release`, which will create a git tag for the version, push git commits and the created tag, and push the `.gem` file to [rubygems.org](https://rubygems.org).

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/aws-solutions/secure-media-delivery-at-the-edge-on-aws.

## License

This project is licensed under the Apache License 2.0.
