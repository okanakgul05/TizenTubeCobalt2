"""Compile ONLY the custom helper to DEX; compile stubs are never packaged."""
from pathlib import Path
import argparse
import json
import subprocess
import tempfile
import zipfile
import hashlib

HERE = Path(__file__).resolve().parent


def run(command):
    subprocess.run(list(map(str, command)), check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--android-jar', required=True, type=Path)
    parser.add_argument('--d8-jar', required=True, type=Path)
    parser.add_argument('--javac', default='javac')
    parser.add_argument('--java', default='java')
    parser.add_argument('--output-dex', required=True, type=Path)
    args = parser.parse_args()
    if args.output_dex.exists():
        parser.error('Output DEX exists; choose a new path')
    sources = sorted((HERE / 'helper/src').rglob('*.java')) + sorted((HERE / 'helper/stubs').rglob('*.java'))
    with tempfile.TemporaryDirectory(prefix='caption-helper-') as directory:
        temporary = Path(directory)
        classes = temporary / 'classes'
        classes.mkdir()
        run([args.javac, '--release', '8', '-cp', args.android_jar, '-d', classes, *sources])
        jar = temporary / 'caption-helper.jar'
        with zipfile.ZipFile(jar, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            packaged = sorted((classes / 'io/github/captiontest').rglob('*.class'))
            if not packaged:
                raise ValueError('No helper classes were compiled')
            for entry in packaged:
                archive.write(entry, entry.relative_to(classes).as_posix())
        dex = temporary / 'dex'
        dex.mkdir()
        run([args.java, '-cp', args.d8_jar, 'com.android.tools.r8.D8', '--release', '--min-api', '24',
             '--lib', args.android_jar, '--output', dex, jar])
        data = (dex / 'classes.dex').read_bytes()
        args.output_dex.parent.mkdir(parents=True, exist_ok=True)
        args.output_dex.write_bytes(data)
    print(json.dumps({'helper_classes': len(packaged), 'compile_stubs_packaged': False,
                      'dex_sha256': hashlib.sha256(data).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
