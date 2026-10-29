import assert from 'node:assert/strict';
import test from 'node:test';
import { transformCaptionPhraseBlocks as transform } from '../mods/utils/captionPhraseBlocks.js';

const fixture = events => ({
    wireMagic: 'pb3', pens: [{}],
    wsWinStyles: [{}, { mhModeHint: 2, juJustifCode: 0, sdScrollDir: 3 }],
    wpWinPositions: [{}, { apPoint: 6, ahHorPos: 20, avVerPos: 100, rcRows: 2, ccCols: 40 }],
    events: [{ id: 1, tStartMs: 0, dDurationMs: 100000, wpWinPosId: 1, wsWinStyleId: 1 }, ...events]
});
const cue = (start, duration, text, extra = {}) => ({
    tStartMs: start, dDurationMs: duration, wWinId: 1, segs: [{ utf8: text }], ...extra
});
const plain = events => events.map(e => (e.segs || []).map(s => s.utf8).join(''))
    .join(' ').replace(/\s+/g, ' ').trim();

function checkStatic(output) {
    let end = -1;
    for (const event of output.events) {
        assert.ok(event.tStartMs >= end, 'cards must not overlap');
        assert.ok(event.dDurationMs > 0 && event.dDurationMs <= 7000);
        assert.equal(event.aAppend, undefined);
        assert.equal(event.segs.length, 1);
        assert.equal(event.segs[0].tOffsetMs, undefined);
        assert.ok(event.segs[0].utf8.split('\n').length <= 2);
        end = event.tStartMs + event.dDurationMs;
    }
}

test('a brief isolated phrase uses available silence to remain readable', () => {
    const input = fixture([
        cue(1000, 350, 'Bu çok hızlı.'),
        cue(4000, 2200, 'Sonraki cümle.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(plain(output.events), plain(input.events));
    checkStatic(output);
    assert.equal(output.events.length, 2);
    assert.ok(output.events[0].dDurationMs >= 1000, 'a phrase should not flash for only 350 ms when there is ample silence');
    assert.ok(output.events[0].tStartMs + output.events[0].dDurationMs <= 4000, 'must not encroach on next speech');
    assert.equal(output.events[1].tStartMs, 4000);
});

test('fast successive progressive fragments form a fixed readable card without losing words', () => {
    const input = fixture([
        cue(1000, 600, 'Bu'),
        cue(1200, 600, 'gerçekten'),
        cue(1400, 600, 'çok hızlı.'),
        cue(3000, 2000, 'Sonraki cümle.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(plain(output.events), plain(input.events));
    checkStatic(output);
    assert.ok(output.events.length <= 2, 'rapid words should not appear as separate changing cards');
    assert.ok(output.events[0].dDurationMs >= 1000, 'merged phrase should not flash briefly');
    assert.ok(output.events[0].tStartMs + output.events[0].dDurationMs <= 3000);
});

test('short adjacent phrases retain both texts and do not collide when no spare time exists', () => {
    const input = fixture([
        cue(1000, 300, 'Evet.'),
        cue(1300, 300, 'Hayır.'),
        cue(1600, 300, 'Belki.'),
        cue(1900, 1800, 'Sonra konuşuruz.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    assert.equal(plain(output.events), plain(input.events));
    checkStatic(output);
    assert.ok(output.events.length <= 2, 'short adjacent sentences can share a card');
});

test('overlapping cumulative replacement snapshots become one static sentence', () => {
    const input = fixture([
        cue(1000, 2500, 'Bu'),
        cue(1350, 2500, 'Bu gerçek'),
        cue(1700, 2500, 'Bu gerçek bir örnek.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(output.events.length, 1);
    assert.equal(plain(output.events), 'Bu gerçek bir örnek.');
    assert.ok(output.events[0].dDurationMs >= 1000);
});

test('real repeated words and a repeated sentence survive cumulative snapshot normalization', () => {
    const input = fixture([
        cue(1000, 2000, 'Git'),
        cue(1300, 2000, 'Git git'),
        cue(1600, 2000, 'Git git şimdi.'),
        cue(5500, 2200, 'Git git şimdi.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), 'Git git şimdi. Git git şimdi.');
    assert.ok(output.events.length <= 2);
    assert.equal(output.events[1].tStartMs, 5500);
});

test('repeated unfinished snapshots within a growing sequence are displayed only once', () => {
    const input = fixture([
        cue(1000, 2500, 'Bu'),
        cue(1300, 2500, 'Bu gerçek'),
        cue(1600, 2500, 'Bu gerçek'),
        cue(1900, 2500, 'Bu gerçek bir örnek.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), 'Bu gerçek bir örnek.');
});

test('source segment offsets inside a cumulative snapshot determine later card timing', () => {
    const input = fixture([
        cue(1000, 3000, 'Bir'),
        { tStartMs: 1300, dDurationMs: 4000, wWinId: 1, segs: [
            { utf8: 'Bir iki' },
            { utf8: ' üç', tOffsetMs: 500 },
            { utf8: ' dört', tOffsetMs: 1000 },
            { utf8: ' beş', tOffsetMs: 1500 },
            { utf8: ' altı.', tOffsetMs: 2000 }
        ] }
    ]);
    const output = transform(input, { lineChars: 8 });
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), 'Bir iki üç dört beş altı.');
    const beş = output.events.find(e => /^beş(?:\s|$)/u.test(e.segs[0].utf8));
    assert.ok(beş, 'test must force a card boundary at the timed word');
    const wordStart = 1300 + 1500;
    assert.ok(beş.tStartMs >= wordStart && beş.tStartMs <= wordStart + 500,
        'the second card follows the original word timing, with at most 500 ms adjustment');
});

test('an actually repeated completed sentence is kept even when the source durations overlap', () => {
    const input = fixture([
        cue(1000, 2200, 'Evet.'),
        cue(1500, 2200, 'Evet.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), 'Evet. Evet.');
});


test('repeated initial unfinished snapshot followed by growth becomes one card', () => {
    const input = fixture([
        cue(1000, 2500, 'Merhaba'),
        cue(1300, 2500, 'Merhaba'),
        cue(1600, 2500, 'Merhaba dünya.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), 'Merhaba dünya.');
});

test('overlapping identical unfinished words without a growing snapshot remain real repetitions', () => {
    const input = fixture([
        cue(1000, 2200, 'Hey'),
        cue(1300, 2200, 'Hey'),
        cue(1600, 2200, 'nasılsın?')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), 'Hey Hey nasılsın?');
});

test('dialogue markers such as double angle brackets survive conversion as plain text', () => {
    const input = fixture([
        cue(1000, 2200, '>> guys'),
        cue(1700, 2500, 'buraya gelin.')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), '>> guys buraya gelin.');
});

test('actual HTML-like tags are passed through unchanged', () => {
    const input = fixture([
        cue(1000, 2200, 'Normal metin.'),
        cue(2000, 2500, '<b>Biçimli metin.</b>')
    ]);
    assert.equal(transform(input), input);
});

test('simultaneous marked speaker changes preserve both voices in static captions', () => {
    const input = fixture([
        { tStartMs: 1000, dDurationMs: 2600, wWinId: 1,
            segs: [{ utf8: '>> Evet.', isSpeakerChange: 1 }] },
        { tStartMs: 1000, dDurationMs: 3000, wWinId: 1,
            segs: [{ utf8: '>> Hayır.', isSpeakerChange: 1 }] }
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), '>> Evet. >> Hayır.');
});

test('unmarked simultaneous revisions stay unchanged instead of guessing the intended text', () => {
    const input = fixture([
        cue(1000, 2600, 'Önceki metin.'),
        cue(1000, 3000, 'Düzeltilmiş metin.')
    ]);
    assert.equal(transform(input), input);
});

test('simultaneous speaker events with different pens remain unchanged', () => {
    const input = fixture([
        { tStartMs: 1000, dDurationMs: 2600, wWinId: 1,
            segs: [{ utf8: '>> Evet.', isSpeakerChange: 1 }] },
        { tStartMs: 1000, dDurationMs: 3000, wWinId: 1,
            segs: [{ utf8: '>> Hayır.', isSpeakerChange: 1, pPenId: 1 }] }
    ]);
    input.pens.push({ fcForeColor: 0xFFFF00 });
    assert.equal(transform(input), input);
});

test('a new speaker beginning with the preceding text is not mistaken for a growing snapshot', () => {
    const input = fixture([
        { tStartMs: 1000, dDurationMs: 2500, wWinId: 1,
            segs: [{ utf8: '>> And', isSpeakerChange: 1 }] },
        { tStartMs: 1600, dDurationMs: 2500, wWinId: 1,
            segs: [{ utf8: '>> And you', isSpeakerChange: 1 }] }
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), '>> And >> And you');
});

test('a structural line separator prevents prefix snapshots from discarding a new utterance', () => {
    const input = fixture([
        cue(1000, 2500, '>> And'),
        cue(1500, 2200, '\n', { aAppend: 1 }),
        cue(1600, 2500, '>> And you')
    ]);
    const output = transform(input);
    assert.notEqual(output, input);
    checkStatic(output);
    assert.equal(plain(output.events), '>> And >> And you');
});
