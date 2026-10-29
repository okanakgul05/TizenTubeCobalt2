import assert from 'node:assert/strict';
import test from 'node:test';
import { transformCaptionPhraseBlocks as transform } from '../mods/utils/captionPhraseBlocks.js';

const cue = (start, duration, text) => ({
    tStartMs: start, dDurationMs: duration, wWinId: 1, segs: [{ utf8: text }]
});
const fixture = events => ({
    wireMagic: 'pb3', pens: [{}],
    wsWinStyles: [{}, { mhModeHint: 2 }],
    wpWinPositions: [{}, { apPoint: 7, ahHorPos: 50, avVerPos: 100 }],
    events: [{ id: 1, tStartMs: 0, dDurationMs: 100000, wpWinPosId: 1, wsWinStyleId: 1 }, ...events]
});
const textOf = event => event.segs.map(s => s.utf8).join('').replace(/\s+/g, ' ').trim();
const textSequence = events => events.map(textOf).join(' ');
const chars = text => Array.from(text.replace(/\s+/g, ' ').trim()).length;
const targetMs = text => Math.ceil(chars(text) / 20 * 1000);

function checkTimeline(events) {
    for (let i = 0; i < events.length; i++) {
        const item = events[i];
        assert.ok(item.dDurationMs > 0 && item.dDurationMs <= 7000);
        if (i) assert.ok(events[i - 1].tStartMs + events[i - 1].dDurationMs <= item.tStartMs);
        assert.ok(item.segs[0].utf8.split('\n').length <= 2);
    }
}

test('a long sentence uses available silence in proportion to its reading length', () => {
    const sentence = 'Bugün erken kalkıp kahvaltı yapmayı düşünüyorum.';
    const later = 'Sonra görüşürüz.';
    const input = fixture([cue(1000, 2000, sentence), cue(4500, 2400, later)]);
    const result = transform(input, { lineChars: 42 });
    assert.notEqual(result, input);
    assert.equal(textSequence(result.events), sentence + ' ' + later);
    assert.equal(result.events.length, 2);
    checkTimeline(result.events);
    assert.ok(result.events[0].dDurationMs >= targetMs(sentence), 'available silence should improve reading speed');
    assert.ok(result.events[0].dDurationMs <= 3000, 'extend by at most one second');
    assert.equal(result.events[1].tStartMs, 4500, 'do not move the next sentence when silence suffices');
});

test('adjacent sentences borrow at most 500 ms while protecting the following card', () => {
    const sentence = 'Bugün erken kalkıp kahvaltı yapmayı düşünüyorum.';
    const later = 'Sonra görüşürüz.';
    const input = fixture([cue(1000, 1600, sentence), cue(2600, 3200, later)]);
    const result = transform(input, { lineChars: 42 });
    assert.notEqual(result, input);
    assert.equal(textSequence(result.events), sentence + ' ' + later);
    assert.equal(result.events.length, 2);
    checkTimeline(result.events);
    assert.ok(result.events[0].dDurationMs > 1600, 'use available time when the first card is difficult to read');
    assert.ok(result.events[1].tStartMs <= 3100, 'do not delay the next card by more than 500 ms');
    assert.ok(result.events[1].dDurationMs >= 1200, 'do not make the following card unreadably short');
});

test('rapid dialogue keeps all text and timing boundaries when time is insufficient', () => {
    const first = 'Bugün erken kalkıp kahvaltı yapmayı düşünüyorum.';
    const second = 'Sonra dışarı çıkıp hep birlikte yürüyüş yapacağız.';
    const input = fixture([cue(1000, 1500, first), cue(2500, 1200, second)]);
    const result = transform(input, { lineChars: 42 });
    assert.notEqual(result, input);
    assert.equal(textSequence(result.events), first + ' ' + second);
    checkTimeline(result.events);
    assert.ok(result.events.some(e => textOf(e).includes('yürüyüş')));
    assert.ok(result.events.every(e => e.tStartMs < 4700), 'do not introduce an unbounded display delay');
});
