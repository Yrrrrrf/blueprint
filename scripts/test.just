# test.just — test runner and coverage

TEST_RULES := '''
[
  {
    "packages": "sdk/core",
    "pattern": "sdk/core/**/*.test.ts",
    "engine": "deno",
    "cwd": "{root}",
    "command": ["deno", "test", "--allow-all", "{package}"]
  },
  {
    "packages": "sdk/api",
    "pattern": "sdk/api/**/*.test.ts",
    "engine": "deno",
    "cwd": "{root}",
    "command": ["deno", "test", "--allow-all", "{package}"]
  },
  {
    "packages": "sdk/renderer",
    "pattern": "sdk/renderer/**/*.test.ts",
    "engine": "deno",
    "cwd": "{root}",
    "command": ["deno", "test", "--allow-all", "{package}"]
  },
  {
    "packages": "sdk/exporters",
    "pattern": "sdk/exporters/**/*.test.ts",
    "engine": "deno",
    "cwd": "{root}",
    "command": ["deno", "test", "--allow-all", "{package}"]
  },
  {
    "packages": "sdk/state",
    "pattern": "sdk/state/**/*.test.ts",
    "engine": "vitest",
    "cwd": "{root}",
    "command": ["deno", "run", "-A", "npm:vitest", "run", "--config", "./config/vitest.config.ts", "--project", "{name}"]
  },
  {
    "packages": "sdk/ui",
    "pattern": "sdk/ui/**/*.test.ts",
    "engine": "vitest",
    "cwd": "{root}",
    "command": ["deno", "run", "-A", "npm:vitest", "run", "--config", "./config/vitest.config.ts", "--project", "{name}"]
  },
  {
    "packages": "apps/vision",
    "pattern": "apps/vision/**/*.test.ts",
    "engine": "vitest",
    "cwd": "{root}",
    "command": ["deno", "run", "-A", "npm:vitest", "run", "--config", "./config/vitest.config.ts", "--project", "{name}"]
  }
]
'''

[doc('Run dynamic test matrix across SDK and Apps (pass -v for logs, -p for parallel)')]
[group('test')]
[positional-arguments]
test *flags:
    ^{{ CLI }} matrix --title "TEST" --rules '{{ TEST_RULES }}' {{ flags }}

[doc('Run browser tests via Playwright')]
[group('test')]
[positional-arguments]
test-browser *flags:
    ^deno run -A npm:@playwright/test test --config config/playwright.config.ts {{ flags }}

[doc('Run export generation test suite')]
[group('test')]
[positional-arguments]
test-exports *flags:
    ^deno test --allow-all sdk/exporters {{ flags }}

[doc('Test coverage via Vitest')]
[group('test')]
[positional-arguments]
coverage *flags:
    ^deno run -A npm:vitest run --coverage --config ./config/vitest.config.ts {{ flags }}
