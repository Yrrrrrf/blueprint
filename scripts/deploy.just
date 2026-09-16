# deploy.just — ship · build, preview, publish, and release

[doc('Run quality gate (check + test) (pass -v for detailed logs, -p for parallel)')]
[group('ci')]
[positional-arguments]
ci *flags: (test flags) (check flags)

[doc('Bundle applications: deno.json -> build/ (pass -v for detailed logs)')]
[group('deploy')]
[positional-arguments]
_bundle *flags:
    ^{{ CLI }} exec {{ flags }} --title BUILD --select all --cwd 'apps/*' -- deno run -A npm:vite build

[doc('Build applications (runs test, check, then bundle) (pass -v for detailed logs)')]
[group('deploy')]
[positional-arguments]
build *flags: (test flags) (check flags) (_bundle flags)

[doc('Preview production build (builds first, then launches preview server)')]
[group('deploy')]
[positional-arguments]
preview *flags: (_bundle flags)
    ^{{ CLI }} exec {{ flags }} --title PREVIEW --select one --cwd 'apps/*' -- deno run -A npm:vite preview

# [confirm("Ship release to production?")]
# [doc('Publish build release')]
# [group('deploy')]
# publish: build
#     @echo "✓ Published release successfully"

cycle: prepare (ci "-vp") build
