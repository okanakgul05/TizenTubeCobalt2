"""Overlay the V21 manifest/userscript on a verified APK; preserve other payloads.

Requires Python 3.10+, Java, apktool, zipalign and apksigner. Passwords are read
by apksigner from environment variable names, never from this repository.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import os
import re
import subprocess
import tempfile
import zipfile

V20_SHA256 = '307d684651fadb8d2d9f2212c2167720ce11071c153bf5fd1f2baecdbf647aeb'
V21_BUNDLE_SHA256 = 'e3fb49e189279cee01fcb51dd727bde5a6ff294f4450b06b6e436060fe07b913'
PACKAGE = 'io.github.captiontest.tizentube'
ASSET = 'assets/caption-test/userScript.js'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def signed_metadata(name):
    return name.startswith('META-INF/') and name.upper().endswith(('.RSA', '.SF', '.MF', '.DSA', '.EC'))


def run(command):
    # Environment credentials are not expanded into the command or printed.
    result = subprocess.run(list(map(str, command)), capture_output=True, text=True,
                            encoding='utf8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'{Path(str(command[0])).name} failed ({result.returncode}):\n'
                           + result.stdout + result.stderr)
    return result.stdout + result.stderr


def tool(java, path):
    return [java, '-jar', path] if str(path).lower().endswith('.jar') else [path]


def compile_manifest(args, temporary):
    decoded = temporary / 'decoded'
    apktool = tool(args.java, args.apktool)
    run(apktool + ['d', '-f', '-s', args.base_apk, '-o', decoded])
    manifest = decoded / 'AndroidManifest.xml'
    text = manifest.read_text(encoding='utf8')
    if f'package="{PACKAGE}"' not in text:
        raise ValueError('Input must already be the caption-test application package')
    for attribute, value in [('versionCode', str(args.version_code)), ('versionName', args.version_name)]:
        text, count = re.subn(r'(\b[\w]+:' + attribute + r'=")[^"]*(")',
                              lambda m: m[1] + value + m[2], text, count=1)
        if count != 1:
            raise ValueError('Decoded manifest missing ' + attribute)
    manifest.write_text(text, encoding='utf8')
    yml = decoded / 'apktool.yml'
    value = yml.read_text(encoding='utf8')
    for key, replacement in [('versionCode', str(args.version_code)), ('versionName', args.version_name)]:
        value, count = re.subn(r'(?m)^(\s*' + key + r':\s*)[^\r\n]+',
                               lambda m: m[1] + replacement, value, count=1)
        if count != 1:
            raise ValueError('apktool.yml missing ' + key)
    yml.write_text(value, encoding='utf8')
    compiled = temporary / 'manifest.apk'
    run(apktool + ['b', decoded, '-o', compiled])
    with zipfile.ZipFile(compiled) as archive:
        return archive.read('AndroidManifest.xml')


def overlay(base, output, manifest, bundle):
    with zipfile.ZipFile(base) as original, zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        if ASSET not in original.namelist():
            raise ValueError('Input APK does not have the existing bundled-script asset')
        for entry in original.infolist():
            if signed_metadata(entry.filename):
                continue
            payload = original.read(entry.filename)
            if entry.filename == 'AndroidManifest.xml':
                payload = manifest
            elif entry.filename == ASSET:
                payload = bundle
            info = copy.copy(entry)
            info.extra = b''
            info.flag_bits = 0
            out.writestr(info, payload, compresslevel=9)


def validate(base, result, bundle):
    changed = []
    preserved = {}
    with zipfile.ZipFile(base) as old, zipfile.ZipFile(result) as current:
        if current.testzip() is not None:
            raise ValueError('APK ZIP integrity check failed')
        old_names = {n for n in old.namelist() if not signed_metadata(n)}
        current_names = {n for n in current.namelist() if not signed_metadata(n)}
        if old_names != current_names:
            raise ValueError('Unexpected APK payload entries changed')
        for name in old_names:
            before, after = old.read(name), current.read(name)
            if before != after:
                changed.append(name)
                if name not in ['AndroidManifest.xml', ASSET]:
                    raise ValueError('Unexpected changed payload: ' + name)
            if old.getinfo(name).compress_type != current.getinfo(name).compress_type:
                raise ValueError('ZIP compression method changed: ' + name)
            if name.startswith(('lib/', 'classes')):
                preserved[name] = sha(after)
        if current.read(ASSET) != bundle:
            raise ValueError('Embedded userscript differs from requested bundle')
    return sorted(changed), preserved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-apk', required=True, type=Path)
    parser.add_argument('--base-sha256', default=V20_SHA256,
                        help='Default is the exact delivered V20 APK; specify an explicit hash for another verified caption-test base')
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--bundle-sha256', default=V21_BUNDLE_SHA256)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--java', default='java')
    parser.add_argument('--apktool', required=True, type=Path)
    parser.add_argument('--zipalign', required=True, type=Path)
    parser.add_argument('--apksigner', type=Path, help='Executable or apksigner.jar; required for signed output')
    parser.add_argument('--keystore', type=Path)
    parser.add_argument('--key-alias', default='caption-test')
    parser.add_argument('--store-pass-env', default='APK_KEYSTORE_PASSWORD')
    parser.add_argument('--key-pass-env', default='APK_KEY_PASSWORD')
    parser.add_argument('--version-code', type=int, default=20321)
    parser.add_argument('--version-name', default='2.0.3-caption-test.21')
    parser.add_argument('--unsigned', action='store_true', help='Produce aligned unsigned output for payload verification only; not installable')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists; choose a new file')
    if sha(args.base_apk.read_bytes()) != args.base_sha256.lower():
        parser.error('Base APK SHA256 mismatch')
    bundle = args.bundle.read_bytes()
    if sha(bundle) != args.bundle_sha256.lower():
        parser.error('Bundle SHA256 mismatch')
    if not args.unsigned:
        if not args.keystore or not args.apksigner:
            parser.error('Signed output requires --keystore and --apksigner')
        for name in [args.store_pass_env, args.key_pass_env]:
            if not os.environ.get(name):
                parser.error('Missing password environment variable: ' + name)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    report = {'package': PACKAGE, 'version_code': args.version_code, 'version_name': args.version_name,
              'base_sha256': args.base_sha256.lower(), 'bundle_sha256': sha(bundle), 'signed': not args.unsigned}
    with tempfile.TemporaryDirectory(prefix='caption-repack-') as directory:
        temporary = Path(directory)
        manifest = compile_manifest(args, temporary)
        unsigned = temporary / 'unsigned.apk'
        aligned = temporary / 'aligned.apk'
        overlay(args.base_apk, unsigned, manifest, bundle)
        run([args.zipalign, '-P', '16', '-f', '4', unsigned, aligned])
        if args.unsigned:
            args.output.write_bytes(aligned.read_bytes())
        else:
            signer = tool(args.java, args.apksigner)
            run(signer + ['sign', '--ks', args.keystore, '--ks-key-alias', args.key_alias,
                          '--ks-pass', 'env:' + args.store_pass_env, '--key-pass', 'env:' + args.key_pass_env,
                          '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false',
                          '--out', args.output, aligned])
            verification = run(signer + ['verify', '--verbose', '--print-certs', args.output])
            if 'Verified using v2 scheme (APK Signature Scheme v2): true' not in verification or 'Verified using v3 scheme (APK Signature Scheme v3): true' not in verification:
                raise ValueError('Expected V2/V3 signature verification missing')
            certificate = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', verification)
            report['certificate_sha256'] = certificate[1] if certificate else None
        run([args.zipalign, '-c', '-P', '16', '4', args.output])
        report['changed_payloads'], report['preserved_native_and_dex_sha256'] = validate(args.base_apk, args.output, bundle)
    report.update({'apk_sha256': sha(args.output.read_bytes()), 'size_bytes': args.output.stat().st_size,
                   'zip_crc_verified': True, 'zipalign_16kb_verified': True})
    args.output.with_suffix('.build-info.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(json.dumps({k: v for k, v in report.items() if k != 'preserved_native_and_dex_sha256'}, indent=2))


if __name__ == '__main__':
    main()
