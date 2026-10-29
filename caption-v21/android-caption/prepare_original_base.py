"""Apply the cumulative bounded native/smali changes to a freshly decoded ARM base.

Decode official v2.0.3 cobalt-arm.apk with apktool first. This preparation script
does not build/sign a complete APK; see README.md for the remaining steps.
"""
from pathlib import Path
import argparse
import hashlib
import html
import json
import re
import shutil
import zipfile

OFFICIAL_SHA256 = {
    'arm': '72a3527f520db3a1b414916ad96481244e451c41e272ae33344ae5e79abb37dd',
    'arm64': '4e3df211abb243cb06b06ba3676fe62c3d5b59baa47c1a0050cb180b3493e539',
}
OLD_SCRIPT = b'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js?v='
PREFIX = b'data:text/javascript,void%200;//bundled-caption-script-'
NEW_SCRIPT = PREFIX + b'x' * (len(OLD_SCRIPT) - len(PREFIX))
OLD_CHECK = b"fetch('https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js', { method: 'HEAD' })"
NEW_CHECK = b'Promise.resolve({ok:true})' + b' ' * (len(OLD_CHECK) - len(b'Promise.resolve({ok:true})'))
HOOK = '    invoke-static {p0}, Lio/github/captiontest/CaptionScriptInstaller;->start(Ldev/cobalt/coat/CobaltActivity;)V'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tag_attribute(text, tag, name, value):
    pattern = r'<' + tag + r'\b[^>]*>'
    match = re.search(pattern, text)
    if not match:
        raise ValueError('Missing manifest tag ' + tag)
    replacement = html.escape(value, quote=True)
    attribute = name + '="' + replacement + '"'
    original = match[0]
    if re.search(r'\b' + re.escape(name) + r'="[^"]*"', original):
        updated = re.sub(r'\b' + re.escape(name) + r'="[^"]*"', lambda _: attribute, original, count=1)
    else:
        updated = original[:-1] + ' ' + attribute + '>'
    return text[:match.start()] + updated + text[match.end():]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arm-apk', required=True, type=Path)
    parser.add_argument('--arm64-apk', required=True, type=Path)
    parser.add_argument('--decoded-arm', required=True, type=Path)
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    decoded = args.decoded_arm.resolve()
    if not (decoded / 'AndroidManifest.xml').is_file():
        parser.error('--decoded-arm must be a freshly decoded official ARM APK tree')
    report = {'official_inputs_sha256': OFFICIAL_SHA256, 'native_changes': [],
              'helper_dex_added': False, 'built_or_signed': False}
    # Validate all inputs and all patch sites before mutating the decoded tree.
    entries = []
    for arch, apk in [('arm', args.arm_apk), ('arm64', args.arm64_apk)]:
        if sha(apk.read_bytes()) != OFFICIAL_SHA256[arch]:
            parser.error('Official ' + arch + ' APK hash mismatch')
        with zipfile.ZipFile(apk) as archive:
            for name in archive.namelist():
                if not name.startswith('lib/') or name.endswith('/'):
                    continue
                payload = archive.read(name)
                if name.endswith('/libchrobalt.so'):
                    if payload.count(OLD_SCRIPT) != 1 or payload.count(OLD_CHECK) != 1:
                        parser.error('Unexpected native loader/probe literal count: ' + name)
                    patched = payload.replace(OLD_SCRIPT, NEW_SCRIPT).replace(OLD_CHECK, NEW_CHECK)
                    if len(patched) != len(payload):
                        raise ValueError('Native patch changed ELF size')
                    report['native_changes'].append({'library': name, 'sha256_before': sha(payload),
                        'sha256_after': sha(patched), 'changed_bytes': sum(a != b for a, b in zip(payload, patched))})
                    payload = patched
                entries.append((name, payload))
    activity = decoded / 'smali_classes2/dev/cobalt/app/MainActivity.smali'
    activity_text = activity.read_text(encoding='utf8')
    needle = '    invoke-super {p0, p1}, Ldev/cobalt/coat/CobaltActivity;->onCreate(Landroid/os/Bundle;)V'
    if activity_text.count(needle) != 1 or 'Lio/github/captiontest/CaptionScriptInstaller;' in activity_text:
        parser.error('Expected a fresh, single MainActivity onCreate patch site')
    native_flags = decoded / 'smali_classes2/org/chromium/build/NativeLibraries.smali'
    flag_text = native_flags.read_text(encoding='utf8')
    for name in ['sSupport32Bit', 'sSupport64Bit']:
        flag_text, count = re.subn(r'(\.field public static final ' + name + r':Z = )(?:true|false)', r'\g<1>true', flag_text)
        if count != 1:
            parser.error('Expected one ABI flag field: ' + name)
    manifest = decoded / 'AndroidManifest.xml'
    text = manifest.read_text(encoding='utf8')
    if 'package="io.gh.reisxd.tizentube.cobalt"' not in text:
        parser.error('Manifest package does not match the fresh official ARM base')
    namespace = re.search(r'xmlns:(\w+)="http://schemas.android.com/apk/res/android"', text)
    if not namespace:
        parser.error('Manifest Android namespace missing')
    prefix = namespace[1] + ':'
    text = text.replace('io.gh.reisxd.tizentube.cobalt', 'io.github.captiontest.tizentube')
    text = tag_attribute(text, 'manifest', prefix + 'versionCode', '20321')
    text = tag_attribute(text, 'manifest', prefix + 'versionName', '2.0.3-caption-test.21')
    text = tag_attribute(text, 'application', prefix + 'label', 'TizenTube Altyazı Testi')
    text = tag_attribute(text, 'application', prefix + 'extractNativeLibs', 'true')
    yml = decoded / 'apktool.yml'
    yml_text = yml.read_text(encoding='utf8')
    for key, value in [('versionCode', '20321'), ('versionName', '2.0.3-caption-test.21')]:
        yml_text, count = re.subn(r'(?m)^(\s*' + key + r':\s*)[^\r\n]+', lambda m: m[1] + value, yml_text, count=1)
        if count != 1:
            parser.error('apktool.yml missing ' + key)
    for name, payload in entries:
        target = decoded / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    asset = decoded / 'assets/caption-test/userScript.js'
    asset.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.bundle, asset)
    activity.write_text(activity_text.replace(needle, needle + '\n\n' + HOOK), encoding='utf8')
    native_flags.write_text(flag_text, encoding='utf8')
    manifest.write_text(text, encoding='utf8')
    yml.write_text(yml_text, encoding='utf8')
    report.update({'package': 'io.github.captiontest.tizentube', 'version_code': 20321,
                   'bundle_sha256': sha(args.bundle.read_bytes()), 'both_arm_abi_flags': True,
                   'extractNativeLibs': True, 'MainActivity_hook': True})
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
