package AWS::SecureMediaDelivery;

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

use 5.014;
use strict;
use warnings;

our $VERSION = '1.2.7';

=head1 NAME

AWS::SecureMediaDelivery - Perl SDK for Secure Media Delivery at the Edge on AWS

=head1 SYNOPSIS

    use AWS::SecureMediaDelivery::Secret;
    use AWS::SecureMediaDelivery::Token;
    use AWS::SecureMediaDelivery::Session;
    
    # Initialize secret manager
    my $secret = AWS::SecureMediaDelivery::Secret->new(
        stack_name => 'MyStack',
        ttl        => 300,
    );
    
    # Create token generator
    my $token = AWS::SecureMediaDelivery::Token->new(secret => $secret);
    
    # Define viewer attributes
    my $viewer_attributes = {
        ip      => '192.168.1.1',
        co      => 'US',
        headers => {
            'user-agent' => 'Mozilla/5.0...',
            'referer'    => 'https://example.com',
        },
    };
    
    # Define token policy
    my $token_policy = {
        ip      => 1,
        co      => 1,
        headers => ['user-agent', 'referer'],
        paths   => ['/video/'],
        exp     => '+2h',
    };
    
    # Generate signed URL
    my $playback_url = 'https://example.cloudfront.net/video/stream.m3u8';
    my $signed_url = $token->generate($viewer_attributes, $playback_url, $token_policy);
    
    print "Signed URL: $signed_url\n";

=head1 DESCRIPTION

This module provides a Perl SDK for the Secure Media Delivery at the Edge on AWS solution.
It allows you to generate secure JWT tokens for media delivery with support for IP validation,
geolocation, headers, query strings, and session management.

=head1 MODULES

=over 4

=item * L<AWS::SecureMediaDelivery::Secret> - Manages cryptographic secrets

=item * L<AWS::SecureMediaDelivery::Token> - Generates JWT tokens

=item * L<AWS::SecureMediaDelivery::Session> - Manages session revocation

=back

=head1 AUTHOR

Amazon Web Services <aws-solutions@amazon.com>

=head1 LICENSE

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0

=cut

1;
