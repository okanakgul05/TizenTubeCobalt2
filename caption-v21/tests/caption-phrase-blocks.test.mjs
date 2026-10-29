import assert from 'node:assert/strict';
import test from 'node:test';
import { transformCaptionPhraseBlocks as transform } from '../mods/utils/captionPhraseBlocks.js';

function fixture(events = []) {
    return {
        wireMagic: 'pb3', pens: [{}],
        wsWinStyles: [{}, { mhModeHint: 2, juJustifCode: 0, sdScrollDir: 3 }],
        wpWinPositions: [{}, { apPoint: 6, ahHorPos: 20, avVerPos: 100, rcRows: 2, ccCols: 40 }],
        events: [
            { id: 1, tStartMs: 0, dDurationMs: 1000000, wpWinPosId: 1, wsWinStyleId: 1 },
            ...events
        ]
    };
}
const cue = (start, duration, segs, extra = {}) => ({ tStartMs: start, dDurationMs: duration, wWinId: 1, segs, ...extra });
const plain = events => events.map(event => (event.segs || []).map(segment => segment.utf8).join('')).join(' ').replace(/\s+/g, ' ').trim();
const freeze = value => {
    if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
    return value;
};
function assertBlocks(result, lineChars = 28) {
    let previousEnd = -1;
    for (const event of result.events) {
        assert.ok(event.tStartMs >= previousEnd);
        assert.ok(event.dDurationMs > 0 && event.dDurationMs <= 7000);
        assert.equal(event.segs.length, 1);
        assert.equal(event.segs[0].tOffsetMs, undefined);
        assert.equal(event.id, undefined);
        assert.equal(event.wWinId, undefined);
        assert.equal(event.aAppend, undefined);
        assert.equal(result.wsWinStyles[event.wsWinStyleId].mhModeHint, 0);
        assert.equal(result.wsWinStyles[event.wsWinStyleId].juJustifCode, 2);
        assert.deepEqual(result.wpWinPositions[event.wpWinPosId], { apPoint: 7, ahHorPos: 50, avVerPos: 100, rcRows: 2 });
        const lines = event.segs[0].utf8.split('\n');
        assert.ok(lines.length <= 2);
        assert.ok(lines.every(line => line.length <= lineChars));
        previousEnd = event.tStartMs + event.dDurationMs;
    }
}

test('progressive words become one static phrase without mutating the input', () => {
    const input = freeze(fixture([cue(1000, 3000, [
        { utf8: 'Bir' }, { utf8: ' örnek', tOffsetMs: 500 }, { utf8: ' cümle.', tOffsetMs: 1000 }
    ])]));
    const snapshot = JSON.stringify(input);
    const result = transform(input);
    assert.notEqual(result, input);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].tStartMs, 1000);
    assert.equal(result.events[0].dDurationMs, 3000);
    assert.equal(result.events[0].segs[0].utf8, 'Bir örnek cümle.');
    assertBlocks(result);
});

test('rollup retention and structural newlines preserve text in readable blocks', () => {
    const input = fixture([
        cue(1000, 4000, [{ utf8: 'İlk ifade.' }]),
        cue(2490, 2510, [{ utf8: '\n' }], { aAppend: 1 }),
        cue(2500, 4000, [{ utf8: 'İkinci ifade.' }])
    ]);
    const result = transform(input);
    assert.equal(result.events.length, 1);
    assert.ok(result.events[0].dDurationMs >= 1600);
    assert.equal(plain(result.events), plain(input.events));
    assertBlocks(result);
});

test('true text append continuations remain in the same phrase and preserve word pieces', () => {
    const input = fixture([
        cue(1000, 2000, [{ utf8: 'Türk' }]),
        cue(1400, 2000, [{ utf8: 'çe' }], { aAppend: 1 }),
        cue(1800, 2000, [{ utf8: ' altyazı.' }], { aAppend: 1 })
    ]);
    const result = transform(input);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].segs[0].utf8, 'Türkçe altyazı.');
    assert.equal(result.events[0].dDurationMs, 2800);
    assertBlocks(result);
});

test('timed long phrase transitions are delayed at most 500 ms from their word timestamps', () => {
    const segments = Array.from({ length: 18 }, (_, i) => ({ utf8: (i ? ' ' : '') + 'kelime' + i, tOffsetMs: i * 250 }));
    const input = fixture([cue(1000, 5000, segments)]);
    const result = transform(input);
    assert.notEqual(result, input);
    assert.ok(result.events.length > 1);
    for (const event of result.events) {
        const firstWord = /^kelime(\d+)/.exec(event.segs[0].utf8);
        assert.ok(firstWord);
        const sourceStart = 1000 + Number(firstWord[1]) * 250;
        assert.ok(event.tStartMs >= sourceStart && event.tStartMs <= sourceStart + 500);
    }
    assert.equal(plain(result.events), plain(input.events));
    assertBlocks(result);
});

test('whole-phrase untimed long text uses monotonic proportional chunk starts', () => {
    const text = Array.from({ length: 22 }, (_, i) => 'sözcük' + i).join(' ');
    const input = fixture([cue(1000, 5500, [{ utf8: text }])]);
    const result = transform(input);
    assert.notEqual(result, input);
    assert.ok(result.events.length > 1);
    assert.equal(result.events[0].tStartMs, 1000);
    assert.equal(plain(result.events), text);
    assertBlocks(result);
});

test('known source pauses remain gaps and each display stays within seven seconds', () => {
    const input = fixture([cue(1000, 20000, [{ utf8: 'Önce' }, { utf8: ' sonra.', tOffsetMs: 12000 }])]);
    const result = transform(input);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].tStartMs, 1000);
    assert.equal(result.events[0].dDurationMs, 7000);
    assert.equal(result.events[1].tStartMs, 13000);
    assert.equal(plain(result.events), plain(input.events));
    assertBlocks(result);
});

test('source pen styling is retained when all words in a phrase use the same pen', () => {
    const input = fixture([cue(1000, 2000, [{ utf8: 'Renkli ifade.', pPenId: 1 }])]);
    input.pens.push({ fcForeColor: 0xFFFF00, bAttr: 1 });
    const result = transform(input);
    assert.equal(result.events[0].pPenId, 1);
    assert.deepEqual(result.pens, input.pens);
    assert.notEqual(result.pens[1], input.pens[1]);
    assertBlocks(result);
});

test('own pop-on output is idempotent, including XHR-backed fetch second passes', () => {
    const output = transform(fixture([cue(1000, 2000, [{ utf8: 'Kısa ifade.' }])]));
    assert.equal(transform(output), output);
});

test('already static plain JSON3, other payloads and empty input retain identity', () => {
    const staticPayload = { wireMagic: 'pb3', events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Sabit ifade.' }] }] };
    for (const input of [null, undefined, {}, [], { events: [] }, staticPayload]) assert.equal(transform(input), input);
});

test('malformed timelines, revisions and unknown referenced windows fail closed', () => {
    const variants = [
        fixture([cue(1000, -5, [{ utf8: 'Metin' }])]),
        fixture([cue(1000, 1000, [{ utf8: 'Metin', tOffsetMs: 1000 }])]),
        fixture([cue(1000, 2000, [{ utf8: 'ilk' }]), cue(1000, 2000, [{ utf8: 'revizyon' }])]),
        fixture([cue(1000, 2000, [{ utf8: 'Metin' }], { wWinId: 9 })]),
        fixture([cue(1000, 2000, [{ utf8: 'Metin' }], { aAppend: 1 })]),
        fixture([cue(2000, 2000, [{ utf8: 'İlk' }]), cue(1000, 2000, [{ utf8: 'Eski' }])])
    ];
    for (const input of variants) assert.equal(transform(input), input);
});

test('mixed layouts, rich text and differently styled words retain the original payload', () => {
    const vertical = fixture([cue(1000, 2000, [{ utf8: 'Metin' }])]);
    vertical.wsWinStyles[1].pdPrintDir = 2;
    const top = fixture([cue(1000, 2000, [{ utf8: 'Metin' }])]);
    top.wpWinPositions[1].apPoint = 1;
    const rich = fixture([cue(1000, 2000, [{ utf8: '<b>Metin</b>' }])]);
    const pens = fixture([cue(1000, 2000, [{ utf8: 'Bir' }, { utf8: ' sözcük', pPenId: 1 }])]);
    pens.pens.push({ iAttr: 1 });
    const malformed = fixture([cue(1000, 2000, [{ utf8: 'Metin' }])]);
    malformed.pens = [null];
    for (const input of [vertical, top, rich, pens, malformed]) assert.equal(transform(input), input);
});

test('an unbreakable token retains the original payload when it cannot fit', () => {
    const token = fixture([cue(1000, 2000, [{ utf8: 'ÇokUzunBirSözcük'.repeat(4) }])]);
    assert.equal(transform(token), token);
});

test('a long timed segment uses approximate word times without losing or reordering text', () => {
    const mixedTiming = fixture([cue(1000, 5000, [
        { utf8: 'kelime '.repeat(20) }, { utf8: 'sonraki', tOffsetMs: 3000 }
    ])]);
    const result = transform(mixedTiming);
    assert.notEqual(result, mixedTiming);
    assert.ok(result.events.length > 1);
    assert.equal(plain(result.events), plain(mixedTiming.events));
    assert.equal(result.events[0].tStartMs, 1000);
    assert.ok(result.events.some(event => event.tStartMs > 1000 && event.tStartMs < 4000));
    assert.ok(result.events.every(event => event.tStartMs < 6000));
    assertBlocks(result);
});

test('repeated words are conserved and input bounds reject pathological event counts', () => {
    const input = fixture([cue(1000, 2000, [{ utf8: 'Bu bu bu tekrar tekrar.' }])]);
    assert.equal(plain(transform(input).events), plain(input.events));
    const large = { wireMagic: 'pb3', events: Array(20001).fill({}) };
    assert.equal(transform(large), large);
});

test('one sentence spanning adjacent ASR groups is displayed as one stable cue', () => {
    const input = freeze(fixture([
        cue(1000, 2000, [{ utf8: 'Bu' }]),
        cue(1600, 2400, [{ utf8: 'araba' }]),
        cue(2200, 2200, [{ utf8: 'çok iyi.' }])
    ]));
    const result = transform(input);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].tStartMs, 1000);
    assert.equal(result.events[0].dDurationMs, 3400);
    assert.equal(result.events[0].segs[0].utf8, 'Bu araba çok iyi.');
    assert.equal(plain(result.events), plain(input.events));
    assertBlocks(result);
});

test('abbreviations, initials and decimals remain inside the sentence', () => {
    for (const lead of ['Dr.', 'A.', 'Değeri 3.14']) {
        const input = fixture([
            cue(1000, 2000, [{ utf8: lead }]),
            cue(2400, 2000, [{ utf8: 'bugün açıklandı.' }])
        ]);
        const result = transform(input);
        assert.equal(result.events.length, 1, lead);
        assert.equal(plain(result.events), lead + ' bugün açıklandı.');
        assertBlocks(result);
    }
});

test('complete sentences keep their boundary while tiny sentences can share one cue', () => {
    const normal = fixture([
        cue(1000, 2500, [{ utf8: 'Günaydın.' }]),
        cue(2600, 2000, [{ utf8: 'Nasılsın?' }])
    ]);
    assert.equal(transform(normal).events.length, 2);
    const tiny = fixture([
        cue(1000, 2500, [{ utf8: 'Evet.' }]),
        cue(1500, 2000, [{ utf8: 'Seni duyuyorum.' }])
    ]);
    const result = transform(tiny);
    assert.equal(result.events.length, 1);
    assert.equal(plain(result.events), 'Evet. Seni duyuyorum.');
    assertBlocks(result);
});

test('a real pause of 700 ms or a pen, style or position change stops merging', () => {
    const paused = fixture([
        cue(1000, 1000, [{ utf8: 'Bugün' }]),
        cue(2700, 2000, [{ utf8: 'hava güzel.' }])
    ]);
    const pen = fixture([
        cue(1000, 2000, [{ utf8: 'Bugün' }]),
        cue(2500, 2000, [{ utf8: 'hava güzel.' }], { pPenId: 1 })
    ]);
    pen.pens.push({ fcForeColor: 0xFFFF00 });
    const style = fixture([
        cue(1000, 2000, [{ utf8: 'Bugün' }]),
        cue(2500, 2000, [{ utf8: 'hava güzel.' }], { wsWinStyleId: 2 })
    ]);
    style.wsWinStyles.push({ mhModeHint: 2, wfoWinFillAlpha: 100 });
    const position = fixture([
        cue(1000, 2000, [{ utf8: 'Bugün' }]),
        cue(2500, 2000, [{ utf8: 'hava güzel.' }], { wpWinPosId: 2 })
    ]);
    position.wpWinPositions.push({ apPoint: 7, ahHorPos: 50, avVerPos: 100, rcRows: 2 });
    for (const input of [paused, pen, style, position]) {
        const result = transform(input);
        assert.equal(result.events.length, 2);
        assert.equal(plain(result.events), plain(input.events));
        assertBlocks(result);
    }
    const pausedResult = transform(paused);
    const firstEnd = pausedResult.events[0].tStartMs + pausedResult.events[0].dDurationMs;
    assert.ok(firstEnd >= 2000 && firstEnd <= 2700, 'extension must stay inside the available silence');
    assert.ok(firstEnd - 2000 <= 1000, 'silence extension must remain bounded');
    assert.equal(pausedResult.events[1].tStartMs, 2700);
    assert.ok(firstEnd <= pausedResult.events[1].tStartMs);
});

test('line breaks keep a common conjunction with its following clause', () => {
    const result = transform(fixture([cue(1000, 4500, [{ utf8: 'Seni anlıyorum ama bunu kabul edemem.' }])]));
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].segs[0].utf8, 'Seni anlıyorum\nama bunu kabul edemem.');
    assertBlocks(result);
});

test('measured line profiles allow wider sentences while enforcing every rendered line', () => {
    const input = fixture([
        cue(1000, 2400, [{ utf8: 'Bugün istasyondan ayrılmadan önce' }]),
        cue(3000, 2500, [{ utf8: 'herkesin hazır olduğunu kontrol ettik.' }])
    ]);
    const result = transform(input, { lineChars: 42, fitsLine: text => text.length <= 38 });
    assert.notEqual(result, input);
    assert.equal(result.events.length, 1);
    assert.equal(plain(result.events), plain(input.events));
    assertBlocks(result, 38);
    assert.equal(transform(result, { lineChars: 42 }), result);
    const narrower = transform(input, { lineChars: 1000, fitsLine: text => text.length <= 20 });
    assert.notEqual(narrower, input);
    assert.equal(plain(narrower.events), plain(input.events));
    assertBlocks(narrower, 20);
});

test('line profile failure never emits a line that the measurement rejected', () => {
    const input = fixture([cue(1000, 2000, [{ utf8: 'Dar alan.' }])]);
    assert.equal(transform(input, { fitsLine: () => false }), input);
    assert.equal(transform(input, { fitsLine: () => { throw new Error('No canvas'); } }), input);
});
