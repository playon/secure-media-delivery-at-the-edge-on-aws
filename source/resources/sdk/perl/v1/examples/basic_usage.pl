#!/usr/bin/env perl

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

use 5.014;
use strict;
use warnings;
use lib '../lib';

use AWS::SecureMediaDelivery::Secret;
use AWS::SecureMediaDelivery::Token;
use AWS::SecureMediaDelivery::Session;

sub main {
    print "AWS Secure Media Delivery Perl SDK - Basic Usage Example\n";
    print "=" x 60 . "\n";
    
    # Initialize secret manager with debug enabled
    my $secret = AWS::SecureMediaDelivery::Secret->new(
        stack_name => 'MySecureStreamStack',
        ttl        => 300,
        debug      => 1,
    );
    
    # Initialize AWS Secrets Manager client
    unless ($secret->init_sm_client()) {
        print "Failed to initialize Secrets Manager client\n";
        return;
    }
    
    # Create token generator with debug enabled
    my $token = AWS::SecureMediaDelivery::Token->new(
        secret => $secret,
        debug  => 1,
    );
    
    # Define viewer attributes
    my $viewer_attributes = {
        ip      => '192.168.1.100',
        co      => 'US',
        reg     => 'CA',
        cty     => 'San Francisco',
        headers => {
            'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'referer'    => 'https://example.com/player',
        },
        qs => {
            quality => '1080p',
            lang    => 'en',
        },
    };
    
    # Define token policy
    my $token_policy = {
        ip                    => 1,
        co                    => 1,
        co_fallback           => 1,
        headers               => ['user-agent', 'referer'],
        querystrings          => ['quality'],
        paths                 => ['/video/', '/live/'],
        exc                   => ['/health', '/status'],
        exp                   => '+2h',
        ssn                   => 1,
        session_auto_generate => 16,
    };
    
    eval {
        # Generate token for HLS stream
        print "\nGenerating token for HLS stream...\n";
        my $hls_url = 'https://d1234567890.cloudfront.net/video/stream.m3u8';
        my $signed_hls_url = $token->generate($viewer_attributes, $hls_url, $token_policy);
        print "Signed HLS URL: $signed_hls_url\n";
        
        # Generate token for DASH stream
        print "\nGenerating token for DASH stream...\n";
        my $dash_url = 'https://d1234567890.cloudfront.net/video/stream.mpd';
        my $signed_dash_url = $token->generate($viewer_attributes, $dash_url, $token_policy);
        print "Signed DASH URL: $signed_dash_url\n";
        
        # Generate standalone token
        print "\nGenerating standalone token...\n";
        my $standalone_token = $token->generate($viewer_attributes, undef, $token_policy);
        print "Standalone token: $standalone_token\n";
    };
    
    if ($@) {
        print "Error generating token: $@\n";
    }
}

sub session_management_example {
    print "\n" . "=" x 50 . "\n";
    print "Session Management Example\n";
    print "=" x 50 . "\n";
    
    # Initialize session management
    AWS::SecureMediaDelivery::Session->initialize('MyRevocationTable', region => 'us-east-1');
    AWS::SecureMediaDelivery::Session->set_debug(1);
    
    # Create session with auto-generated ID
    my $session1 = AWS::SecureMediaDelivery::Session->new(autogenerate => 1);
    print "Auto-generated session ID: " . $session1->id . "\n";
    
    # Create session with specific ID
    my $session2 = AWS::SecureMediaDelivery::Session->new(id => 'user-session-12345');
    print "Custom session ID: " . $session2->id . "\n";
    
    # Create session with custom length
    my $session3 = AWS::SecureMediaDelivery::Session->new(
        autogenerate => 1,
        length       => 20,
    );
    print "Custom length session ID: " . $session3->id . "\n";
    
    eval {
        # Revoke a session
        print "\nRevoking session: " . $session2->id . "\n";
        my $success = $session2->revoke(
            expiry_period => 86400,
            reason        => 'SUSPICIOUS_ACTIVITY',
        );
        
        if ($success) {
            print "Session revoked successfully\n";
        } else {
            print "Failed to revoke session\n";
        }
    };
    
    if ($@) {
        print "Error revoking session: $@\n";
    }
}

sub custom_secret_example {
    print "\n" . "=" x 50 . "\n";
    print "Custom Secret Retrieval Example\n";
    print "=" x 50 . "\n";
    
    # Custom secret retrieval function
    my $custom_secret_retriever = sub {
        my ($stack_name) = @_;
        print "Custom retrieval for stack: $stack_name\n";
        
        # In a real implementation, you might retrieve from:
        # - A different AWS service
        # - A local file
        # - An external API
        # - A database
        
        return {
            primary => {
                uuid  => 'custom-key-uuid-12345',
                value => 'custom-secret-value-abcdef',
            },
            secondary => {
                uuid  => 'custom-key-uuid-67890',
                value => 'custom-secret-value-ghijkl',
            },
        };
    };
    
    # Initialize secret with custom retrieval
    my $secret = AWS::SecureMediaDelivery::Secret->new(
        stack_name        => 'MyStack',
        ttl               => 300,
        retrieve_mode     => 'custom',
        retrieve_function => $custom_secret_retriever,
        debug             => 1,
    );
    
    eval {
        # Retrieve keys using custom function
        my $keys = $secret->retrieve_keys();
        print "Retrieved keys: " . join(', ', keys %$keys) . "\n";
        print "Primary key UUID: " . $keys->{primary}->{uuid} . "\n";
    };
    
    if ($@) {
        print "Error with custom secret retrieval: $@\n";
    }
}

sub token_policy_examples {
    print "\n" . "=" x 50 . "\n";
    print "Token Policy Examples\n";
    print "=" x 50 . "\n";
    
    # Example 1: Basic IP and country validation
    my $basic_policy = {
        ip    => 1,
        co    => 1,
        paths => ['/video/'],
        exp   => '+1h',
    };
    print "Basic Policy: " . _hash_to_string($basic_policy) . "\n";
    
    # Example 2: Comprehensive validation
    my $comprehensive_policy = {
        ip                    => 1,
        co                    => 1,
        co_fallback           => 1,
        reg                   => 1,
        cty                   => 1,
        ssn                   => 1,
        session_auto_generate => 16,
        headers               => ['user-agent', 'referer', 'authorization'],
        querystrings          => ['quality', 'lang', 'device'],
        paths                 => ['/video/', '/live/', '/vod/'],
        exc                   => ['/health', '/status', '/metrics'],
        exp                   => '+4h',
        nbf                   => time() - 300,  # Valid 5 minutes ago
    };
    print "Comprehensive Policy: " . _hash_to_string($comprehensive_policy) . "\n";
    
    # Example 3: Session-based with fallbacks
    my $session_policy = {
        ip           => 1,
        co           => 1,
        co_fallback  => 1,
        reg          => 1,
        reg_fallback => 1,
        ssn          => 1,
        headers      => ['user-agent'],
        paths        => ['/premium/'],
        exp          => '+30m',  # Short expiration for premium content
    };
    print "Session Policy: " . _hash_to_string($session_policy) . "\n";
}

sub _hash_to_string {
    my ($hash) = @_;
    my @pairs;
    for my $key (sort keys %$hash) {
        my $value = $hash->{$key};
        if (ref $value eq 'ARRAY') {
            $value = '[' . join(', ', @$value) . ']';
        }
        push @pairs, "$key => $value";
    }
    return '{' . join(', ', @pairs) . '}';
}

# Run examples
main();
session_management_example();
custom_secret_example();
token_policy_examples();
