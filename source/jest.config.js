module.exports = {
    "roots": [
      "<rootDir>/test"
    ],
    testMatch: [ '**/*.test.ts'],
    "transform": {
      "^.+\\.tsx?$": "ts-jest"
    },
    testPathIgnorePatterns: ["source/bin/wizard", "source/helpers"],
    coverageReporters: [
      "text",
      ["lcov", {"projectRoot": "../"}]
    ]
  }
