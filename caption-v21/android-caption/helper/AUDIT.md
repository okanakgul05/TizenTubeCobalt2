# v2 helper audit

Audited on 20 October 2026. This document records static and fake-runtime checks; Android acceptance is owned by the parent task and its emulator logs.

## Confirmed API differences

- The published v2.0.3 APK's `GEN_JNI.org_chromium_content_browser_webcontents_WebContentsImpl_evaluateJavaScriptForTests` method unconditionally throws `RuntimeException("Native method not present")`. A Java interface declaration or upstream C++ implementation does not prove that a release has a native method registered.
- `WebContentsImpl_getMainFrame` actually dispatches to `J/N.OJ`, selector 12.
- `RenderFrameHostImpl_executeJavaScriptInIsolatedWorld` actually dispatches to `J/N.VIJOO`, selector 0. Its public Java interface signature matches the helper's compiled call.
- v2 uses positive isolated world 1 and a nonce-bearing DOM script to run the bundled code in the main world. Main/isolated JavaScript globals are intentionally not treated as shared. The document element's status attribute is shared and used for completion reporting.

## Concrete readiness correction

The first saved v2 wrapper incorrectly required `registry.mappings.get(...)`. The existing upstream TizenTube `pictureInPicture.js` and `innerTubeCalls.js` instead find an object with a `mappings` member and call `registry.get(...)` on that object itself. The wrapper now follows the upstream shape. This change is contained in the JAR below.

Helper-only JAR SHA-256:

`d7a651075e0196c3b4c68fe7789a43af7b81c32998c035757827521d70033a6d`

The JAR contains only `io/github/captiontest` helper classes, not compile stubs. Compilation against the Android 36 SDK JAR succeeded at Java 8 classfile level.

## Test evidence

Nine fake JVM lifecycle test groups pass: once-per-document installation/cache; document readiness; delayed/replaced WebContents; destroyed Activity; bounded retries/skipped origins; bounded attachment/asset failures; caught API exceptions/blocked DOM insertion; callback timeouts/stale generations; missing main frame.

Six generated-JavaScript test groups pass using separate Node VM contexts for the main and isolated worlds: correct upstream registry and duplicate skip; missing native bridge waits/resumes; missing registry does not install; missing nonce does not insert; Trusted Types absence/policy failure is explicit; unrelated origins skip/bundle exceptions report failure.

The old v1 fake tests were stale and did not implement v2's `getMainFrame`/`RenderFrameHost` interface. They have been updated. These tests do not establish that Chromium's real CSP/Trusted Types policy permits insertion, that the real YouTube registry is ready within the retry window, or that playback/subtitle selection succeeds.

## Re-run fake tests

Compile the helper source, compile stubs (excluding the stub `WebContentsObserver`), and `tests/**/*.java` against the fake Android/observer classes into `test-classes`. Run `io.github.captiontest.CaptionScriptInstallerTest`.

Run the same test main with `--dump insertion-test.js` to generate the JavaScript wrapper with a test asset, then run `node tests/verify-insertion.mjs` from any directory.

## Remaining runtime acceptance checks

The emulator must show the actual main-world completion marker and usable YouTube UI, not only “submitted” or a live process. Verify absence of fatal JNI exceptions and inspect console failures for nonce, Trusted Types, parsing, or registry readiness. The chosen video still needs source-track and translated-request verification separately.
