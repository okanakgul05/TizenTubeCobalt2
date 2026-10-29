import assert from 'node:assert/strict';
import test from 'node:test';
import { createCaptionPhraseProfile } from '../mods/features/captionPhraseBlocks.js';

function fixture(width = 1920, height = 1080, overrides = {}) {
    const context = {
        font: '', calls: 0,
        measureText(text) {
            this.calls++;
            const size = Number(/([\d.]+)px/.exec(this.font)?.[1]);
            return { width: [...text].reduce((sum, char) => sum + (char === 'W' ? 1 : 0.5), 0) * size };
        }
    };
    const settings = { fontSizeIncrement: 0, fontFamily: 4, fontStyle: 0, ...overrides };
    const player = { clientWidth: width, clientHeight: height, getSubtitlesUserSettings: () => settings };
    const view = { document: {
        querySelector: () => player,
        createElement: () => ({ getContext: () => context })
    } };
    return { view, context, player, settings };
}

test('normal and enlarged fonts use a measured snapshot at 720p, 1080p and 4K', () => {
    for (const [width, height] of [[1280, 720], [1920, 1080], [3840, 2160]]) {
        const normal = fixture(width, height);
        const large = fixture(width, height, { fontSizeIncrement: 2 });
        const first = createCaptionPhraseProfile(normal.view, { pens: [{}] });
        const second = createCaptionPhraseProfile(large.view, { pens: [{}] });
        assert.equal(first.lineChars, 42);
        assert.equal(second.lineChars, 42);
        assert.equal(first.fitsLine('a'.repeat(38)), true);
        assert.equal(second.fitsLine('a'.repeat(40)), false);
        assert.equal(second.fitsLine('a'.repeat(26)), true);
    }
});

test('actual glyph widths matter and repeated candidates use the response-local cache', () => {
    const { view, context } = fixture();
    const profile = createCaptionPhraseProfile(view, { pens: [{}] });
    assert.equal(profile.fitsLine('a'.repeat(30)), true);
    assert.equal(profile.fitsLine('W'.repeat(30)), false);
    const calls = context.calls;
    assert.equal(profile.fitsLine('a'.repeat(30)), true);
    assert.equal(context.calls, calls);
    assert.equal(profile.fitsLine(null), false);
    assert.equal(profile.fitsLine('a'.repeat(1001)), false);
});

test('font family, bold and italic settings are reflected without changing player settings', () => {
    const { view, context, settings } = fixture(1920, 1080, { fontStyle: 3, fontFamily: 1 });
    const before = { ...settings };
    const profile = createCaptionPhraseProfile(view, { pens: [{}] });
    assert.ok(profile);
    assert.match(context.font, /^italic bold 48px "Courier New"/);
    assert.deepEqual(settings, before);
    settings.fontSizeIncrement = 2;
    assert.equal(profile.fitsLine('a'.repeat(38)), true, 'Existing response keeps its original snapshot');
});

test('missing settings, unavailable canvas and invalid geometry keep the conservative fallback', () => {
    for (const change of [
        fixture => { fixture.player.getSubtitlesUserSettings = () => null; },
        fixture => { fixture.player.clientWidth = 0; },
        fixture => { fixture.player.clientHeight = NaN; },
        fixture => { fixture.view.document.createElement = () => ({}); },
        fixture => { fixture.view.document.fonts = { check: () => false }; },
        fixture => { fixture.context.measureText = () => ({ width: NaN }); },
        fixture => { fixture.settings.fontFamily = 99; },
        fixture => { fixture.settings.fontFamily = 7; },
        fixture => { fixture.settings.fontSizeIncrement = -4; },
        fixture => { fixture.player.getSubtitlesUserSettings = () => { throw new Error('not ready'); }; }
    ]) {
        const item = fixture();
        change(item);
        assert.equal(createCaptionPhraseProfile(item.view, { pens: [{}] }), undefined);
    }
    assert.equal(createCaptionPhraseProfile({}, {}), undefined);
});

test('source font/offset/ruby overrides decline a global profile, color-only pens remain eligible', () => {
    const { view } = fixture();
    for (const key of ['szPenSize', 'fsFontStyle', 'bAttr', 'iAttr', 'ofOffset', 'rbRuby', 'hgHorizGroup']) {
        assert.equal(createCaptionPhraseProfile(view, { pens: [{ [key]: 1 }] }), undefined, key);
    }
    assert.ok(createCaptionPhraseProfile(view, { pens: [{ fcForeColor: 0xFFFF00 }] }));
    for (const pens of [null, {}, [null]]) assert.equal(createCaptionPhraseProfile(view, { pens }), undefined);
});
