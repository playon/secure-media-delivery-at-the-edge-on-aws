#!/usr/bin/env perl

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

use 5.014;
use strict;
use warnings;
use ExtUtils::MakeMaker;

WriteMakefile(
    NAME             => 'AWS::SecureMediaDelivery',
    AUTHOR           => 'Amazon Web Services <aws-solutions@amazon.com>',
    VERSION_FROM     => 'lib/AWS/SecureMediaDelivery.pm',
    ABSTRACT_FROM    => 'lib/AWS/SecureMediaDelivery.pm',
    LICENSE          => 'apache_2_0',
    MIN_PERL_VERSION => '5.014',
    CONFIGURE_REQUIRES => {
        'ExtUtils::MakeMaker' => '0',
    },
    BUILD_REQUIRES => {
        'Test::More' => '0',
        'Test::Exception' => '0',
    },
    PREREQ_PM => {
        'Paws'                => '0.44',
        'JSON'                => '4.02',
        'Crypt::JWT'          => '0.033',
        'Net::IP'             => '1.26',
        'URI'                 => '5.10',
        'Time::HiRes'         => '1.9764',
        'Digest::HMAC_SHA256' => '1.04',
        'MIME::Base64'        => '3.16',
        'Moose'               => '2.2014',
        'namespace::autoclean' => '0.29',
    },
    TEST_REQUIRES => {
        'Test::More'      => '0',
        'Test::Exception' => '0',
        'Test::MockModule' => '0.176.0',
    },
    dist  => { COMPRESS => 'gzip -9f', SUFFIX => 'gz', },
    clean => { FILES => 'AWS-SecureMediaDelivery-*' },
    META_MERGE => {
        'meta-spec' => { version => 2 },
        resources => {
            repository => {
                type => 'git',
                url  => 'https://github.com/aws-solutions/secure-media-delivery-at-the-edge-on-aws.git',
                web  => 'https://github.com/aws-solutions/secure-media-delivery-at-the-edge-on-aws',
            },
            homepage => 'https://aws.amazon.com/solutions/implementations/secure-media-delivery-at-the-edge/',
            bugtracker => {
                web => 'https://github.com/aws-solutions/secure-media-delivery-at-the-edge-on-aws/issues',
            },
        },
    },
);
