# Android caption build sources

This folder preserves the Android changes used by the cumulative V21 caption APK: a bundled TizenTube userscript, the successful V2 Java injection helper, two bounded native loader/probe literal patches, the MainActivity hook, both ARM ABI flags, and compressed native-library packaging with `extractNativeLibs=true`.

The APK is a repack of the official [TizenTubeCobalt v2.0.3 release](https://github.com/reisxd/TizenTubeCobalt/releases/tag/v2.0.3). Chromium/Cobalt was not rebuilt from source. The rest of this repository contains the current TizenTube JavaScript and its tests. Read `RELEASE-V21.json` for exact delivered hashes.

## Verified release

- Application ID: `io.github.captiontest.tizentube`.
- Version: `2.0.3-caption-test.21`, version code `20321`.
- Delivered APK SHA256: `0ed86772dad17f33859eb2732ebbefc9289637f9dadca414aa600c17b6fb31e6`.
- Embedded userscript SHA256: `e3fb49e189279cee01fcb51dd727bde5a6ff294f4450b06b6e436060fe07b913`.
- Helper-only `classes4.dex` SHA256: `4ac9db30c337f1b4132988ca864911d5705786d4d0548e5d6c4d64fcc61adf9a`.

The Java helper source was recompiled from this folder and reproduced that exact shipped DEX hash. Compile stubs are excluded from the helper JAR/DEX. Nine fake JVM lifecycle groups and six separate-world JavaScript groups passed. These tests do not substitute for Android execution; original release validation also verified Android emulator startup and main-world script completion.

## Source map

| File | Purpose |
| --- | --- |
| `helper/src/` | Successful `CaptionScriptInstaller` source retained since V2 |
| `helper/stubs/` | Compile-only Cobalt/Chromium declarations |
| `helper/tests/` | Fake Android/Chromium lifecycle and JavaScript insertion tests |
| `helper/AUDIT.md` | Historical helper API audit and validation limits |
| `helper-source-provenance.json` | Original source hashes; the JS test accepts an external generated fixture path |
| `prepare_original_base.py` | Verified official inputs → bounded native patches, manifest, asset and smali hooks |
| `build_helper.py` | Java 8 helper compilation and helper-only D8 output |
| `assemble_unsigned.py` | Adds helper DEX and applies the compressed-library packaging correction |
| `repack_v21.py` | Verified existing caption-test APK → V21 manifest/bundle overlay, alignment and external signing |
| `test_helper.py` | Portable fake-runtime test runner |

## Tools and credentials

Use Python 3.10+, Node.js, Java/Javac, apktool, Android SDK Platform 36 `android.jar`, Android Build Tools 36 D8/apksigner and a zipalign version supporting `-P 16`. The release used JDK 25 with `--release 8` for helper classfiles and D8 minimum API 24.

Keystores and passwords are deliberately external. `repack_v21.py` passes password environment-variable **names** to apksigner using `env:`. Before signing, populate `APK_KEYSTORE_PASSWORD` and `APK_KEY_PASSWORD` in your local environment using your own credential-management method; their values are never part of a source file. The variable names can be overridden with CLI flags.

A build signed with a different key cannot update an installed V21 signed with the retained original key. Signing timestamps/tool versions can change output bytes, so use payload/hash verification in addition to the delivered APK hash. Existing output paths are rejected to avoid accidental replacement.

## Portable final repack

Build the repository userscript using `npm ci` and `npm run build` in `mods/`. Run `node --test tests/*.test.mjs` from the repository root. `mods/package-lock.json` is needed for the exact dependency snapshot. The delivered `release/v21/userScript.js` is an exact release artifact; a fresh build must be checked against its recorded hash.

Supply the delivered V20 APK and bundled userscript:

```text
python android-caption/repack_v21.py --base-apk inputs/TizenTube-Altyazi-Sinema-v20.apk --bundle dist/userScript.js --output build/TizenTube-v21.apk --apktool tools/apktool.jar --zipalign tools/zipalign --apksigner tools/apksigner.jar --keystore private/signing.p12 --key-alias caption-test
```

Use `.exe` tool paths on Windows. `--java` selects a Java executable when it is not on PATH. The default input hashes pin the exact delivered V20 and V21 bundle. To use another verified caption-test APK or a deliberately changed userscript, pass its explicitly verified `--base-sha256` or `--bundle-sha256`. Never accept an unknown input solely by copying a hash returned from an untrusted download.

For payload/alignment checking without a signing key, add `--unsigned`; that output is not installable. The tool decodes/recompiles the manifest with apktool, then copies only the new compiled manifest and userscript into the original ZIP. Every other DEX/native/resource payload must stay byte-identical. Original ZIP compression methods are retained; ZIP CRCs, 16 KiB alignment and signed-mode APK V2/V3 signatures are checked. The output's adjacent `.build-info.json` records hashes without private credentials.

## Reconstructing from the official base

The following source recipe preserves the full cumulative Android patch instead of requiring all intermediate caption-test APK versions. The helper compilation and portable final overlay are validated separately; the entire new recipe has not been run end-to-end as an independent release. Do not claim byte-for-byte reproduction of the delivered APK from this recipe until validating a complete build with the pinned tools.

1. Obtain the official v2.0.3 ARM and ARM64 APKs from the linked release. SHA256 values are enforced by `prepare_original_base.py`: ARM `72a3527f520db3a1b414916ad96481244e451c41e272ae33344ae5e79abb37dd`; ARM64 `4e3df211abb243cb06b06ba3676fe62c3d5b59baa47c1a0050cb180b3493e539`.
2. Decode ARM with source/smali enabled: `java -jar tools/apktool.jar d inputs/cobalt-arm.apk -o build/decoded-arm`.
3. Apply the bounded preparation once to that fresh tree:

```text
python android-caption/prepare_original_base.py --arm-apk inputs/cobalt-arm.apk --arm64-apk inputs/cobalt-arm64.apk --decoded-arm build/decoded-arm --bundle dist/userScript.js --report build/native-patch-report.json
```

4. Compile the helper:

```text
python android-caption/build_helper.py --android-jar tools/android.jar --d8-jar tools/d8.jar --output-dex build/helper.dex
```

5. Build the prepared base: `java -jar tools/apktool.jar b build/decoded-arm -o build/prepared.apk`.
6. Add only the custom helper DEX and compress the native libraries:

```text
python android-caption/assemble_unsigned.py --compiled-apk build/prepared.apk --helper-dex build/helper.dex --output build/prepared-unsigned.apk
```

7. Calculate/verify the prepared unsigned APK SHA256 and pass it explicitly to `repack_v21.py --base-apk build/prepared-unsigned.apk --base-sha256 <verified-hash>` with the usual bundle/tool/signing arguments. This supplies alignment, signing and final payload verification.
8. Verify package/version, native ABI flags, absence of packaged compile stubs, all asset/native/DEX hashes, real Android startup and main-world injection completion before distributing the result.

The native preparation replaces exactly two loader/probe literals per `libchrobalt.so`, preserving ELF lengths and machine code. It adds the MainActivity helper call, sets both ARM ABI flags and `extractNativeLibs=true`, updates the caption-test application identity/version, and embeds the userscript. The final packaging compresses `.so` entries for the tested installation layout.

## Helper tests

```text
python android-caption/test_helper.py
```

Use `--java`, `--javac` and `--node` for explicit tool locations. The runner keeps generated classfiles and insertion fixtures in temporary directories. JVM tests use fake Android/Chromium services; JavaScript tests use separate fake isolated/main worlds. JNI registration, real CSP/Trusted Types behavior and actual video caption correctness require Android/player testing.

## Files kept outside Git

Do not commit signing keys/passwords, `.apk/.dex/.jar/.class` intermediates, SDK binaries, decoded upstream APK trees, cookies, raw signed caption URLs, player responses, emulator data or logcat dumps. Historical source archives contained password literals in build scripts and are not copied here. No private signing material is required for a source backup.

Keep the repository GPL-3.0 licensing for TizenTube. The helper source declares Apache-2.0; official Cobalt/native components retain their upstream and third-party licenses. The upstream Tizen/WGT GitHub workflow is separate from these Android tools.
