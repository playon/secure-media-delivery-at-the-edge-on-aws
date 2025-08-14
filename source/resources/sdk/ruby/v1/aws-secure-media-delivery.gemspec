# frozen_string_literal: true

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

require_relative 'lib/aws_secure_media_delivery/version'

Gem::Specification.new do |spec|
  spec.name          = 'aws-secure-media-delivery'
  spec.version       = AwsSecureMediaDelivery::VERSION
  spec.authors       = ['Amazon Web Services']
  spec.email         = ['aws-solutions@amazon.com']

  spec.summary       = 'Ruby SDK for Secure Media Delivery at the Edge on AWS Solution'
  spec.description   = 'Ruby SDK for generating secure tokens for media delivery at the edge using AWS CloudFront'
  spec.homepage      = 'https://aws.amazon.com/solutions/implementations/secure-media-delivery-at-the-edge/'
  spec.license       = 'Apache-2.0'
  spec.required_ruby_version = '>= 2.7.0'

  spec.metadata['homepage_uri'] = spec.homepage
  spec.metadata['source_code_uri'] = 'https://github.com/aws-solutions/secure-media-delivery-at-the-edge-on-aws'
  spec.metadata['changelog_uri'] = 'https://github.com/aws-solutions/secure-media-delivery-at-the-edge-on-aws/blob/main/CHANGELOG.md'

  # Specify which files should be added to the gem when it is released.
  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    `git ls-files -z`.split("\x0").reject { |f| f.match(%r{\A(?:test|spec|features)/}) }
  end
  spec.bindir        = 'exe'
  spec.executables   = spec.files.grep(%r{\Aexe/}) { |f| File.basename(f) }
  spec.require_paths = ['lib']

  # Runtime dependencies
  spec.add_dependency 'aws-sdk-secretsmanager', '~> 1.0'
  spec.add_dependency 'aws-sdk-dynamodb', '~> 1.0'
  spec.add_dependency 'jwt', '~> 2.7'
  spec.add_dependency 'ipaddr', '~> 1.2'
  spec.add_dependency 'concurrent-ruby', '~> 1.2'

  # Development dependencies
  spec.add_development_dependency 'bundler', '~> 2.0'
  spec.add_development_dependency 'rake', '~> 13.0'
  spec.add_development_dependency 'rspec', '~> 3.0'
  spec.add_development_dependency 'rubocop', '~> 1.0'
  spec.add_development_dependency 'yard', '~> 0.9'
  spec.add_development_dependency 'simplecov', '~> 0.21'
end
