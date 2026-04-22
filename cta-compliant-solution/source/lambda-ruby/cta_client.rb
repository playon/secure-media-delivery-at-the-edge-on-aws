# CTA-5007-B Ruby SDK
# Generates COSE MAC0 / CWT tokens compatible with cf.cwt.validateToken()

require 'openssl'

module CTA
  # COSE / CWT constants (matching CloudFront docs)
  COSE_ALG = 1
  COSE_KID = 4
  HMAC_256 = 5

  module CWT
    ISS = 1; SUB = 2; AUD = 3; EXP = 4; NBF = 5; IAT = 6; CTI = 7
  end

  module CAT
    CATU = 401; CATNIP = 402; CATM = 403; CATR = 404
  end

  module CATU
    HOST = 1; PATH = 2; EXT = 3
  end

  module MATCH
    PREFIX = 1; SUFFIX = 2; EXACT = 3
  end

  # --- Minimal CBOR encoder ---

  def self.cbor_uint_head(major, value)
    m = major << 5
    if value < 24
      [m | value].pack('C')
    elsif value < 0x100
      [m | 24, value].pack('CC')
    elsif value < 0x10000
      [m | 25, value].pack('Cn')
    elsif value < 0x100000000
      [m | 26, value].pack('CN')
    else
      [m | 27, value].pack('CQ>')
    end
  end

  def self.cbor_encode(value)
    case value
    when Integer
      value >= 0 ? cbor_uint_head(0, value) : cbor_uint_head(1, -1 - value)
    when String
      if value.encoding == Encoding::BINARY || value.encoding == Encoding::ASCII_8BIT
        cbor_uint_head(2, value.bytesize) + value
      else
        bytes = value.encode('UTF-8')
        cbor_uint_head(3, bytes.bytesize) + bytes.b
      end
    when Array
      cbor_uint_head(4, value.length) + value.map { |v| cbor_encode(v) }.join
    when Hash
      cbor_uint_head(5, value.length) + value.map { |k, v| cbor_encode(k) + cbor_encode(v) }.join
    when NilClass
      "\xf6".b
    when TrueClass
      "\xf5".b
    when FalseClass
      "\xf4".b
    else
      raise "Cannot CBOR encode: #{value.class}"
    end
  end

  def self.cbor_tag(tag_num, content)
    if tag_num < 24
      [0xd8, tag_num].pack('CC') + content
    else
      cbor_uint_head(6, tag_num) + content
    end
  end

  # --- COSE MAC0 / CWT token generation ---

  def self.generate_token(claims, key, kid: 'key:default', cwt_tag: true)
    protected_bytes = cbor_encode({ COSE_ALG => HMAC_256 })
    unprotected_map = { COSE_KID => kid.encode('UTF-8').b }
    payload_bytes = cbor_encode(claims)

    mac_structure = cbor_encode(["MAC0", protected_bytes, "".b, payload_bytes])
    tag = OpenSSL::HMAC.digest('SHA256', key, mac_structure)

    arr = cbor_encode([protected_bytes, unprotected_map, payload_bytes, tag])
    cose_mac0 = cbor_tag(17, arr)

    cwt_tag ? cbor_tag(61, cose_mac0) : cose_mac0
  end

  def self.parse_ttl(ttl)
    return ttl if ttl.is_a?(Integer)
    m = ttl.to_s.match(/^(\d+)([smhd])$/)
    return 7200 unless m
    v = m[1].to_i
    { 's' => v, 'm' => v * 60, 'h' => v * 3600, 'd' => v * 86400 }[m[2]] || 7200
  end
end
