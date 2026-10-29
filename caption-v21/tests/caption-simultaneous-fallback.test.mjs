import assert from 'node:assert/strict';
import test from 'node:test';
import { transformCaptionPhraseBlocks as transform } from '../mods/utils/captionPhraseBlocks.js';

const fixture = (first, second) => ({
    wireMagic: 'pb3', pens: [{}],
    wsWinStyles: [{}, { mhModeHint: 2 }],
    wpWinPositions: [{}, { apPoint: 7 }],
    events: [
        { id: 1, tStartMs: 0, dDurationMs: 60000, wsWinStyleId: 1, wpWinPosId: 1 },
        ...[first, second].map(text => ({
            wWinId: 1, tStartMs: 1000, dDurationMs: 5000,
            segs: [{ utf8: text, isSpeakerChange: 1 }]
        }))
    ]
});

test('two long simultaneous speakers keep the native payload instead of fabricating later speech', () => {
    const input = fixture('>> Birinci konuşmacı uzun bir cümle söylüyor',
        '>> İkinci konuşmacı aynı anda başka bir cümle söylüyor');
    const before = JSON.stringify(input);
    assert.equal(transform(input), input);
    assert.equal(JSON.stringify(input), before);
});

test('short simultaneous speakers that fit stay on one static card', () => {
    const input = fixture('>> Evet', '>> Hayır');
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(output.events.length, 1);
    assert.equal(output.events[0].tStartMs, 1000);
    assert.equal(output.events[0].segs[0].utf8, '>> Evet\n>> Hayır');
});

test('speaker metadata separates simultaneous speech even without textual markers', () => {
    const input = fixture('Merhaba arkadaşım.', 'Selam, nasılsın?');
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(output.events.length, 1);
    assert.equal(output.events[0].tStartMs, 1000);
    assert.equal(output.events[0].segs[0].utf8, 'Merhaba arkadaşım.\nSelam, nasılsın?');
    const inputWords = input.events.flatMap(event => (event.segs || []).map(seg => seg.utf8)).join(' ').split(/\s+/);
    const outputWords = output.events[0].segs[0].utf8.split(/\s+/);
    assert.deepEqual(outputWords, inputWords);
});

test('long simultaneous speech without textual markers also retains the original payload', () => {
    const input = fixture('Birinci konuşmacı uzun bir cümle söylüyor',
        'İkinci konuşmacı aynı anda başka bir cümle söylüyor');
    const snapshot = JSON.stringify(input);
    assert.equal(transform(input), input);
    assert.equal(JSON.stringify(input), snapshot);
});
