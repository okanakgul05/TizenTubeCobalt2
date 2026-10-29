import assert from 'node:assert/strict';
import test from 'node:test';
import { transformCaptionPhraseBlocks as transform } from '../mods/utils/captionPhraseBlocks.js';

function fixture(events) {
    return {
        wireMagic: 'pb3', pens: [{}],
        wsWinStyles: [{}, { mhModeHint: 2 }],
        wpWinPositions: [{}, { apPoint: 7 }],
        events: [{ id: 1, tStartMs: 0, dDurationMs: 60000, wsWinStyleId: 1, wpWinPosId: 1 }, ...events]
    };
}

function text(events) {
    return events.flatMap(event => (event.segs || []).map(segment => segment.utf8))
        .join(' ').replace(/\s+/g, ' ').trim();
}

function assertCards(events) {
    let previousEnd = 0;
    for (const event of events) {
        assert.ok(event.tStartMs >= previousEnd, 'cards must not overlap');
        assert.ok(event.dDurationMs > 0 && event.dDurationMs <= 7000);
        assert.equal(event.segs.length, 1);
        assert.equal(event.segs[0].tOffsetMs, undefined);
        const lines = event.segs[0].utf8.split('\n');
        assert.ok(lines.length <= 2);
        assert.ok(lines.every(line => line.length <= 28));
        previousEnd = event.tStartMs + event.dDurationMs;
    }
}

test('a long timed segment can split into cards without dropping words or falling back', () => {
    const input = fixture([{ wWinId: 1, tStartMs: 1000, dDurationMs: 7000, segs: [
        { utf8: 'Bu uzun metindeki sözcüklerin her biri aynı zamanda geldiğinde altyazı sisteminin tamamı özgün davranışa geri döner' },
        { utf8: ' ve sonunda.', tOffsetMs: 4000 }
    ] }]);
    const output = transform(input);
    assert.notEqual(output, input, 'the entire video must not fall back to progressive captions');
    assert.ok(output.events.length > 1);
    assert.equal(text(output.events), text(input.events));
    assertCards(output.events);
    assert.equal(output.events[0].tStartMs, 1000);
    assert.ok(output.events.at(-1).tStartMs < 8000);
});

test('simultaneous speakers retain separate lines on the same card', () => {
    const input = fixture([
        { wWinId: 1, tStartMs: 1000, dDurationMs: 2500, segs: [{ utf8: '>> Evet', isSpeakerChange: 1 }] },
        { wWinId: 1, tStartMs: 1000, dDurationMs: 2500, segs: [
            { utf8: '>> Hayır', isSpeakerChange: 1 }, { utf8: ' olmaz.', tOffsetMs: 500 }
        ] }
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(output.events.length, 1);
    assert.equal(output.events[0].segs[0].utf8, '>> Evet\n>> Hayır olmaz.');
    assertCards(output.events);
});

test('both simultaneous speaker lines respect the measured width limit', () => {
    const input = fixture([
        { wWinId: 1, tStartMs: 1000, dDurationMs: 2500, segs: [{ utf8: '>> Merhaba', isSpeakerChange: 1 }] },
        { wWinId: 1, tStartMs: 1000, dDurationMs: 2500, segs: [
            { utf8: '>> Nasılsın?', isSpeakerChange: 1 }, { utf8: ' İyi mi?', tOffsetMs: 500 }
        ] }
    ]);
    const width = 20;
    const output = transform(input, { lineChars: 28, fitsLine: line => line.length <= width });
    assert.notEqual(output, input);
    assert.equal(text(output.events), text(input.events));
    assertCards(output.events);
    for (const event of output.events) {
        assert.ok(event.segs[0].utf8.split('\n').every(line => line.length <= width));
    }
    assert.equal(output.events[0].segs[0].utf8, '>> Merhaba\n>> Nasılsın? İyi mi?');
});

test('the final brief card remains on screen long enough to read', () => {
    const input = fixture([{ wWinId: 1, tStartMs: 1000, dDurationMs: 250, segs: [{ utf8: 'Merhaba.' }] }]);
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(output.events.length, 1);
    assert.equal(text(output.events), 'Merhaba.');
    assert.ok(output.events[0].dDurationMs >= 1200);
    assert.ok(output.events[0].dDurationMs <= 1250, 'extension past the source end is capped at one second');
    assertCards(output.events);
});
