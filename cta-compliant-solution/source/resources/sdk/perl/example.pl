#!/usr/bin/env perl

use strict;
use warnings;
use lib '.';
use CTAClient;
use Data::Dumper;

# Example usage of CTA-5007-B Perl SDK

sub main {
    print "CTA-5007-B Perl SDK Example\n";
    print "===========================\n\n";
    
    # Initialize client
    my $client = CTAClient->new(
        stack_name => 'CTASecureMedia',
        region     => 'us-east-1'
    );
    
    # Initialize AWS Secrets Manager
    eval {
        $client->init_secrets_manager();
        print "✓ Secrets Manager initialized\n";
        
        # Get signing keys
        $client->get_signing_keys();
        print "✓ Signing keys retrieved\n\n";
    };
    
    if ($@) {
        print "✗ AWS setup failed: $@\n";
        print "Note: Ensure AWS credentials are configured\n";
        return;
    }
    
    # Example 1: Basic video protection
    print "Example 1: Basic Video Protection\n";
    print "-" x 35 . "\n";
    
    my $basic_url = $client->generate_signed_url(
        'https://cdn.example.com/video/stream.m3u8',
        {
            paths => ['/video/'],
            ttl   => '2h'
        },
        { country => 'us' }
    );
    
    print "Original URL: https://cdn.example.com/video/stream.m3u8\n";
    print "Signed URL:   $basic_url\n\n";
    
    # Example 2: Geographic restrictions
    print "Example 2: Geographic Restrictions\n";
    print "-" x 34 . "\n";
    
    my $geo_url = $client->generate_signed_url(
        'https://cdn.example.com/premium/content.m3u8',
        {
            paths     => ['/premium/'],
            ttl       => '24h',
            countries => ['us', 'ca', 'gb'],
            placement => 'query'
        },
        { country => 'us' }
    );
    
    print "Geographic URL: $geo_url\n\n";
    
    # Example 3: Session-based token
    print "Example 3: Session-based Token\n";
    print "-" x 30 . "\n";
    
    my $session_result = $client->generate_cwt_token(
        {
            paths     => ['/live/'],
            ttl       => '1h',
            sessionId => 'user-session-' . time(),
            placement => 'header'
        },
        { country => 'us' }
    );
    
    print "Token: " . substr($session_result->{token}, 0, 50) . "...\n";
    print "Expires: " . localtime($session_result->{expiresAt}) . "\n";
    print "Claims: " . Dumper($session_result->{claims}) . "\n";
    
    print "✓ All examples completed successfully!\n";
}

# Run examples if script is executed directly
main() if __FILE__ eq $0;

1;
