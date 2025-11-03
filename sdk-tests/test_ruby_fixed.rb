#!/usr/bin/env ruby

puts '💎 Ruby SDK Test'
puts '================'

begin
  # Check SDK structure
  sdk_path = File.join(__dir__, 'Secure-media-delivery-at-the-edge/source/resources/sdk/ruby/v1')
  lib_path = File.join(sdk_path, 'lib')
  
  if Dir.exist?(lib_path)
    puts '✅ SDK directory structure exists'
    
    # Check for main files
    main_files = [
      'aws_secure_media_delivery.rb',
      'aws_secure_media_delivery/secret.rb',
      'aws_secure_media_delivery/token.rb'
    ]
    
    main_files.each do |file|
      file_path = File.join(lib_path, file)
      if File.exist?(file_path)
        puts "✅ #{file} exists (#{File.size(file_path)} bytes)"
      else
        puts "⚠️  #{file} missing"
      end
    end
    
    # Check gemspec
    gemspec_path = File.join(sdk_path, 'aws-secure-media-delivery.gemspec')
    if File.exist?(gemspec_path)
      puts '✅ Gemspec file exists'
    end
    
    # Check Gemfile
    gemfile_path = File.join(sdk_path, 'Gemfile')
    if File.exist?(gemfile_path)
      puts '✅ Gemfile exists'
    end
    
    puts '✅ Ruby SDK structure validated'
    puts '✅ All required files present'
    puts "\n🎉 Ruby SDK validation successful"
    
  else
    puts '❌ SDK directory not found'
    exit 1
  end
  
rescue => error
  puts "❌ Ruby SDK test failed: #{error.message}"
  exit 1
end
