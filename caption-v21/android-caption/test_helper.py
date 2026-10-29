"""Run fake Android/Chromium lifecycle and separate-world JavaScript helper tests."""
from pathlib import Path
import argparse
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--javac', default='javac')
    parser.add_argument('--java', default='java')
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    sources = sorted((HERE / 'helper/src').rglob('*.java'))
    sources += [p for p in sorted((HERE / 'helper/stubs').rglob('*.java')) if p.name != 'WebContentsObserver.java']
    sources += sorted((HERE / 'helper/tests').rglob('*.java'))
    with tempfile.TemporaryDirectory(prefix='caption-helper-test-') as directory:
        temporary = Path(directory)
        subprocess.run(list(map(str, [args.javac, '--release', '8', '-d', temporary, *sources])), check=True)
        command = [args.java, '-cp', str(temporary), 'io.github.captiontest.CaptionScriptInstallerTest']
        subprocess.run(command, check=True)
        insertion = temporary / 'insertion-test.js'
        subprocess.run(command + ['--dump', str(insertion)], check=True)
        subprocess.run([args.node, str(HERE / 'helper/tests/verify-insertion.mjs'), str(insertion)], check=True)


if __name__ == '__main__':
    main()
