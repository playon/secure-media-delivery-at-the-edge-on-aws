# AWS Secure Media Delivery Go SDK

Go SDK for the Secure Media Delivery at the Edge on AWS Solution.

> **⚠️ Development Status**: This Go SDK is currently under active development. While it provides full feature parity with the Node.js version, the **Node.js SDK is considered the most stable and production-ready** implementation at this time. Please use the Node.js SDK for production workloads until this Go version reaches stable release.

## Installation

```bash
go get github.com/aws-solutions/secure-media-delivery-go
```

## Quick Start

```go
package main

import (
    "context"
    "fmt"
    "time"
    
    smd "github.com/aws-solutions/secure-media-delivery-go"
)

func main() {
    ctx := context.Background()
    
    // Initialize secret manager
    secret, err := smd.NewSecretManager("MyStack", 5*time.Minute)
    if err != nil {
        panic(err)
    }
    
    // Create token generator
    token := smd.NewTokenGenerator(secret)
    
    // Define viewer attributes
    viewerAttrs := &smd.ViewerAttributes{
        IP:      "192.168.1.1",
        Country: "US",
        Headers: map[string]string{
            "user-agent": "Mozilla/5.0...",
            "referer":    "https://example.com",
        },
    }
    
    // Define token policy
    policy := &smd.TokenPolicy{
        IP:      true,
        Country: true,
        Headers: []string{"user-agent", "referer"},
        Paths:   []string{"/video/"},
        Exp:     "+2h",
    }
    
    // Generate signed URL
    playbackURL := "https://example.cloudfront.net/video/stream.m3u8"
    signedURL, err := token.Generate(ctx, viewerAttrs, playbackURL, policy)
    if err != nil {
        panic(err)
    }
    
    fmt.Println("Signed URL:", signedURL)
}
```

## Features

- **Context Support**: All operations support Go's context.Context
- **Type Safety**: Strong typing with struct definitions
- **Error Handling**: Idiomatic Go error handling
- **Concurrency Safe**: Thread-safe operations
- **AWS SDK v2**: Uses latest AWS SDK for Go v2

## Documentation

See the [Go SDK Guide](GO_SDK_GUIDE.md) for comprehensive documentation.

## License

Apache License 2.0
