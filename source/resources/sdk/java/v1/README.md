# AWS Secure Media Delivery Java SDK

Java SDK for the Secure Media Delivery at the Edge on AWS Solution.

> **⚠️ Development Status**: This Java SDK is currently under active development. While it provides full feature parity with the Node.js version, the **Node.js SDK is considered the most stable and production-ready** implementation at this time. Please use the Node.js SDK for production workloads until this Java version reaches stable release.

## Installation

### Maven
Add this dependency to your `pom.xml`:

```xml
<dependency>
    <groupId>com.amazonaws.solutions</groupId>
    <artifactId>secure-media-delivery</artifactId>
    <version>1.2.7</version>
</dependency>
```

### Gradle
Add this dependency to your `build.gradle`:

```gradle
implementation 'com.amazonaws.solutions:secure-media-delivery:1.2.7'
```

## Quick Start

```java
import com.amazonaws.solutions.securemediadelivery.SecretManager;
import com.amazonaws.solutions.securemediadelivery.TokenGenerator;
import java.time.Duration;
import java.util.Map;
import java.util.List;
import java.util.concurrent.CompletableFuture;

// Initialize secret manager
SecretManager secret = new SecretManager("MyStack", Duration.ofMinutes(5));

// Create token generator
TokenGenerator token = new TokenGenerator(secret);

// Define viewer attributes
Map<String, Object> viewerAttributes = Map.of(
    "ip", "192.168.1.1",
    "co", "US",
    "headers", Map.of(
        "user-agent", "Mozilla/5.0...",
        "referer", "https://example.com"
    )
);

// Define token policy
Map<String, Object> tokenPolicy = Map.of(
    "ip", true,
    "co", true,
    "headers", List.of("user-agent", "referer"),
    "paths", List.of("/video/"),
    "exp", "+2h"
);

// Generate signed URL
String playbackUrl = "https://example.cloudfront.net/video/stream.m3u8";
CompletableFuture<String> signedUrl = token.generate(viewerAttributes, playbackUrl, tokenPolicy);
System.out.println("Signed URL: " + signedUrl.get());
```

## Features

- **CompletableFuture Support**: All async operations return CompletableFuture
- **AWS SDK v2**: Uses the latest AWS SDK for Java v2
- **Thread Safety**: Thread-safe operations with proper locking
- **Type Safety**: Strong typing with comprehensive validation
- **Maven/Gradle**: Standard Java build tool integration

## Classes

### SecretManager
Manages cryptographic secrets for token signing.

### TokenGenerator
Generates JWT tokens with various security policies.

### SessionManager
Manages session revocation and tracking.

## Requirements

- Java 11+
- AWS SDK for Java v2
- Jackson for JSON processing
- JJWT for JWT token handling

## Building from Source

```bash
cd source/resources/sdk/java/v1
mvn clean compile
mvn test
mvn package
```

## License

Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: Apache-2.0
