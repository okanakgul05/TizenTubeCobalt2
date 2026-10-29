"""Assemble the prepared apktool APK + helper-only DEX, compressing native libs.

The prepared manifest must set extractNativeLibs=true. Output is UNSIGNED and
must be aligned/signed before installation (repack_v21.py supports that step).
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import zipfile


def signature(name):
    return name.startswith('META-INF/') and name.upper().endswith(('.RSA', '.SF', '.MF', '.DSA', '.EC'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiled-apk', required=True, type=Path)
    parser.add_argument('--helper-dex', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output exists; choose a new path')
    data = args.helper_dex.read_bytes()
    if not data.startswith(b'dex\n'):
        parser.error('Helper file is not DEX')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.compiled_apk) as original, zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        names = original.namelist()
        if 'classes4.dex' in names:
            parser.error('Compiled base already has classes4.dex; do not replace an unknown DEX')
        if 'assets/caption-test/userScript.js' not in names:
            parser.error('Compiled base is missing the prepared userscript asset')
        for item in original.infolist():
            if signature(item.filename):
                continue
            info = copy.copy(item)
            info.extra = b''
            info.flag_bits = 0
            if item.filename.startswith('lib/') and item.filename.endswith('.so'):
                info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, original.read(item.filename), compresslevel=9)
        out.writestr('classes4.dex', data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(args.output) as archive:
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity check failed')
    print(json.dumps({'signed': False, 'aligned': False,
                      'apk_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
                      'helper_dex_sha256': hashlib.sha256(data).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
