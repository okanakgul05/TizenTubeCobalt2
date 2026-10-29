import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercises the generated JavaScript against separate fake main/isolated worlds.
// It is not a replacement for Android/Chromium CSP and JNI runtime testing.
const insertion = fs.readFileSync(process.argv[2] || new URL('../insertion-test.js', import.meta.url), 'utf8');
function fixture({ bridge = true, registry = true, nonce = true, trustedTypes = true,
    rejectPolicy = false, hostname = 'www.youtube.com', failBundle = false } = {}) {
    const attributes = new Map();
    const storage = new Map();
    let executions = 0;
    const root = {
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name) ?? null; },
    };
    let main;
    const document = {
        documentElement: root,
        readyState: 'complete',
        querySelectorAll() { return nonce ? [{ nonce: 'test-page-nonce' }] : []; },
        createElement() { return { nonce: '', textContent: '', remove() {} }; },
        head: {
            appendChild(script) {
                assert.equal(script.nonce, 'test-page-nonce');
                executions++;
                vm.runInContext(script.textContent, main);
                return script;
            },
        },
    };
    const location = { protocol: 'https:', hostname };
    const quiet = { info() {}, error() {} };
    main = vm.createContext({ document, location, console: quiet,
        localStorage: {
            getItem(name) { return storage.get(name) ?? null; },
            setItem(name, value) { storage.set(name, value); },
        },
    });
    main.window = main;
    if (bridge) main.h5vcc = { tizentube: {} };
    if (registry) main._yttv = { registry: { mappings: {}, get(name) {
        return ['PlayerService', 'PlaybackPreviewService'].includes(name) ? {} : undefined;
    } } };
    const isolated = vm.createContext({ document, location, console: quiet });
    isolated.window = isolated;
    if (trustedTypes) isolated.trustedTypes = {
        createPolicy(name, handlers) {
            assert.equal(name, 'ttCaptionBundle');
            if (rejectPolicy) throw new TypeError('Test Trusted Types policy rejection');
            return { createScript: handlers.createScript };
        },
    };
    const code = failBundle ? insertion.replace('window.__helperTestBundleWasRun=true;',
        "throw new Error('Test bundle failure');") : insertion;
    return { main, isolated, storage, root,
        execute() { return vm.runInContext(code, isolated); },
        executions() { return executions; },
    };
}

let value = fixture();
assert.equal(value.execute(), 'ready');
assert.equal(value.main.__helperTestBundleWasRun, true);
assert.equal(value.isolated.__helperTestBundleWasRun, undefined);
assert.equal(value.storage.get('ttCaptionSourceGuard'), 'rewrite');
assert.equal(JSON.parse(value.storage.get('ytaf-configuration')).enableUpdater, false);
assert.equal(value.execute(), 'ready');
assert.equal(value.executions(), 1);
console.log('PASS main-world completion with upstream registry shape; duplicate skip');

value = fixture({ bridge: false });
assert.equal(value.execute(), 'wait:bridge');
assert.equal(value.main.__helperTestBundleWasRun, undefined);
value.main.h5vcc = { tizentube: {} };
assert.equal(value.execute(), 'ready');
console.log('PASS missing native bridge waits then resumes');

value = fixture({ registry: false });
assert.equal(value.execute(), 'wait:youtube');
assert.equal(value.main.__helperTestBundleWasRun, undefined);
console.log('PASS missing YouTube registry remains uninstalled');

value = fixture({ nonce: false });
assert.equal(value.execute(), 'wait:nonce');
assert.equal(value.executions(), 0);
console.log('PASS nonce absence prevents insertion');

value = fixture({ trustedTypes: false });
assert.equal(value.execute(), 'ready');
value = fixture({ rejectPolicy: true });
assert.match(value.execute(), /^failed:dom-insertion:/);
assert.equal(value.main.__helperTestBundleWasRun, undefined);
console.log('PASS Trusted Types absence and policy failure are explicit');

value = fixture({ hostname: 'unrelated.example' });
assert.equal(value.execute(), 'skip');
assert.equal(value.executions(), 0);
value = fixture({ failBundle: true });
assert.equal(value.execute(), 'failed');
assert.equal(value.root.getAttribute('data-tt-caption-bundle'), 'failed');
console.log('PASS unrelated origins skip and bundle exceptions report failure');
