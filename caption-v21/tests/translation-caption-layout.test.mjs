import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Stub only the existing player's readiness hook. Geometry logic is imported
// unchanged from production; real DOM/renderer coverage lives in browser QA.
const source = (await readFile(new URL('../mods/features/translationCaptionLayout.js', import.meta.url), 'utf8'))
    .replace("import { onPlayer } from '../utils/Player.js';", 'const onPlayer = () => {};');
const { installTranslationCaptionLayout, captionAnchor, captionWidthLimit } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function environment() {
    let track;
    let poll;
    let frameId = 0;
    const frames = new Map();
    const classes = new Set();
    const listeners = new Map();
    const box = { left: 0, right: 1920, top: 0, bottom: 1080, width: 1920, height: 1080 };
    const container = { isConnected: true, clientWidth: 1920,
        getBoundingClientRect: () => box, querySelectorAll: () => [] };
    const player = { isConnected: true,
        classList: { add: value => classes.add(value), remove: value => classes.delete(value),
            contains: value => classes.has(value) },
        querySelector: () => container, contains: value => value === container,
        getBoundingClientRect: () => box, getOption: () => track,
        addEventListener: (event, listener) => listeners.set(event, listener),
        removeEventListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); } };
    const view = {
        document: { documentElement: {}, querySelector: selector => selector === '.html5-video-player' ? player : container },
        MutationObserver: class { observe() {} disconnect() {} },
        requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame: id => frames.delete(id),
        setInterval: callback => { poll = callback; return 1; }, clearInterval: () => { poll = null; },
        addEventListener() {}, removeEventListener() {}
    };
    return { player, view, listeners, frames,
        select(value) { track = value; listeners.get('captionschanged')?.(); },
        paint() { for (const [id, callback] of Array.from(frames)) { frames.delete(id); callback(); } },
        poll() { poll?.(); } };
}

test('original, automatic and translated tracks share the same caption boundary across switches', () => {
    const env = environment();
    const layout = installTranslationCaptionLayout(env.player, env.view);
    try {
        for (const track of [{ languageCode: 'en' }, { languageCode: 'tr', kind: 'asr' },
            { languageCode: 'en', translationLanguage: { languageCode: 'tr' } },
            { languageCode: 'ja' }, null, {}]) {
            env.select(track);
            assert.equal(env.player.classList.contains('tt-translated-captions'), true);
            assert.doesNotThrow(() => env.paint(), 'an empty or disabled caption container is harmless');
        }
        env.player.isConnected = false;
        env.poll();
        assert.equal(env.player.classList.contains('tt-translated-captions'), false);
        assert.equal(env.frames.size, 0);
    } finally { layout.dispose(); }
    assert.equal(env.listeners.size, 0);
});

test('caption boundaries work before track metadata is available and clean up on disposal', () => {
    const env = environment();
    delete env.player.getOption;
    const layout = installTranslationCaptionLayout(env.player, env.view);
    assert.equal(env.player.classList.contains('tt-translated-captions'), true);
    assert.equal(env.listeners.size, 0);
    assert.doesNotThrow(() => env.paint());
    layout.dispose();
    assert.equal(env.player.classList.contains('tt-translated-captions'), false);
    assert.equal(env.frames.size, 0);
});

test('left and right native anchors produce the same symmetric column', () => {
    const left = captionAnchor({ left: '23%', right: '', marginLeft: '', transform: '' }, 2000);
    const right = captionAnchor({ left: '', right: '23%', marginLeft: '', transform: '' }, 2000);
    assert.deepEqual(left, { kind: 'left', position: 460 });
    assert.deepEqual(right, { kind: 'right', position: 1540 });
    assert.ok(Math.abs(captionWidthLimit(left, 2000) - 0.54) < 1e-9);
    assert.ok(Math.abs(captionWidthLimit(right, 2000) - 0.54) < 1e-9);
});

test('negative native margin and percentage transform identify centered windows', () => {
    for (const style of [
        { left: '50%', marginLeft: '-320px', transform: '' },
        { left: '50%', marginLeft: '', transform: 'translateX(-50%)' },
        { left: '50%', marginLeft: '', transform: 'translate(-50%, -50%)' }
    ]) {
        const anchor = captionAnchor(style, 2000);
        assert.deepEqual(anchor, { kind: 'center', position: 1000 });
        assert.ok(Math.abs(captionWidthLimit(anchor, 2000) - 0.54) < 1e-9);
    }
});

test('centered anchors retain the fixed column and left pixel anchors set symmetric insets', () => {
    const anchor = captionAnchor({ left: '40%', marginLeft: '-150px' }, 2000);
    assert.equal(anchor.kind, 'center');
    assert.ok(Math.abs(captionWidthLimit(anchor, 2000) - 0.54) < 1e-9);
    const pixel = captionAnchor({ left: '500px' }, 2000);
    assert.deepEqual(pixel, { kind: 'left', position: 500 });
    assert.equal(captionWidthLimit(pixel, 2000), 0.5);
});

test('unknown or out-of-safe-area anchors use the default symmetric inset', () => {
    assert.equal(captionAnchor({ left: 'auto', right: 'auto' }, 2000), null);
    for (const anchor of [null, { kind: 'left', position: 1950 }, { kind: 'right', position: 50 }]) {
        assert.ok(Math.abs(captionWidthLimit(anchor, 2000) - 0.54) < 1e-9);
    }
});

test('native edge anchors keep at least ten percent on both sides', () => {
    for (const position of [0, 100, 199, 200]) {
        assert.ok(Math.abs(captionWidthLimit({ kind: 'left', position }, 2000) - 0.8) < 1e-9);
        assert.ok(Math.abs(captionWidthLimit({ kind: 'right', position: 2000 - position }, 2000) - 0.8) < 1e-9);
    }
    assert.ok(Math.abs(captionWidthLimit({ kind: 'left', position: 300 }, 2000) - 0.7) < 1e-9);
    assert.ok(Math.abs(captionWidthLimit({ kind: 'right', position: 1700 }, 2000) - 0.7) < 1e-9);
});
