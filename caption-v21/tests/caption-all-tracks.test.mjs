import assert from 'node:assert/strict';
import test from 'node:test';
import { transformCaptionPhraseBlocks as transform } from '../mods/utils/captionPhraseBlocks.js';

const text = payload => payload.events.flatMap(event => (event.segs || []).map(segment => segment.utf8))
    .join(' ').replace(/\s+/g, ' ').trim();

function progressive(parts, extra = {}) {
    return {
        wireMagic: 'pb3', pens: [{}],
        events: [{ tStartMs: 1000, dDurationMs: 4000, segs: parts.map((utf8, index) => ({
            utf8, tOffsetMs: index * 500
        })), ...extra }]
    };
}

function assertStatic(result) {
    let previousEnd = 0;
    for (const event of result.events) {
        assert.ok(event.tStartMs >= previousEnd, 'cards do not overlap');
        assert.ok(event.dDurationMs > 0 && event.dDurationMs <= 7000);
        assert.equal(event.segs.length, 1);
        assert.equal(event.segs[0].tOffsetMs, undefined, 'text appears together');
        assert.equal(result.wsWinStyles[event.wsWinStyleId].mhModeHint, 0);
        assert.equal(result.wsWinStyles[event.wsWinStyleId].juJustifCode, 2);
        assert.ok(event.segs[0].utf8.split('\n').length <= 2);
        previousEnd = event.tStartMs + event.dDurationMs;
    }
}

test('original progressive English captions need no translation metadata to become static cards', () => {
    const input = progressive(['This', ' is', ' the', ' original', ' English', ' track.']);
    const result = transform(input);
    assert.notEqual(result, input);
    assert.equal(text(result), text(input));
    assertStatic(result);
    assert.equal(result.events[0].tStartMs, 1000);
});

test('complete manually authored captions retain their original text and timing', () => {
    const input = { wireMagic: 'pb3', events: [
        { tStartMs: 1000, dDurationMs: 2200, segs: [{ utf8: 'A complete sentence.\nWith a second line.' }] },
        { tStartMs: 4000, dDurationMs: 2500, segs: [{ utf8: 'The next subtitle is already complete.' }] }
    ] };
    assert.equal(transform(input), input);
});

test('complete manual subtitles with inline emphasis retain their styling', () => {
    const input = { wireMagic: 'pb3', pens: [{}, { iAttr: 1 }], events: [
        { tStartMs: 1000, dDurationMs: 3000, segs: [
            { utf8: 'An ' }, { utf8: 'emphasized', pPenId: 1 }, { utf8: ' word.' }
        ] }
    ] };
    assert.equal(transform(input), input);
});

for (const [language, parts] of [
    ['Turkish', ['Bu', ' özgün', ' Türkçe', ' altyazıdır.']],
    ['Russian', ['Это', ' оригинальные', ' русские', ' субтитры.']],
    ['Arabic', ['هذه', ' ترجمة', ' عربية', ' أصلية.']],
    ['Hebrew', ['אלה', ' כתוביות', ' מקוריות', ' בעברית.']]
]) {
    test(`${language} progressive captions preserve every word and their order`, () => {
        const input = progressive(parts);
        const result = transform(input);
        assert.notEqual(result, input);
        assert.equal(text(result), text(input));
        assertStatic(result);
    });
}

test('continuous Japanese caption segments do not gain spaces between characters', () => {
    const input = progressive(['今日', 'は', 'いい', '天気', 'です。']);
    const result = transform(input);
    assert.notEqual(result, input);
    assert.equal(result.events.map(event => event.segs[0].utf8).join(''), '今日はいい天気です。');
    assertStatic(result);
});

test('continuous Chinese text that cannot fit is preserved safely instead of truncated', () => {
    const input = progressive(['这是一段没有空格的很长的中文字幕我们需要确保全部文字保持原样并且不会由于换行限制而被截断']);
    // Roll-up itself is progressive evidence even without a positive offset.
    input.wsWinStyles = [{}, { mhModeHint: 2 }];
    input.events[0].wsWinStyleId = 1;
    assert.equal(transform(input), input);
});
