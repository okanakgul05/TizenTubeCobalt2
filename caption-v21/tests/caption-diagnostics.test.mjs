import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionDiagnosticStore, redactCaptionRequest, captionDiagnosticLines }
    from '../mods/features/captionDiagnostics.js';

const videoId = 'FEC-6Pv2ikE';
const timedtext = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&sig=DO-NOT-KEEP&ip=1.2.3.4`;

test('direct captions and translations are observed regardless of rewrite eligibility', () => {
    const store = createCaptionDiagnosticStore();
    store.request(timedtext, 'xhr');
    assert.deepEqual(store.snapshot().request, {
        host: 'www.youtube.com', v: videoId, lang: 'en', kind: 'asr', transport: 'xhr',
        queryKeys: ['ip', 'kind', 'lang', 'sig', 'v'],
    });
    store.request(`${timedtext}&tlang=tr&fmt=json3`, 'fetch');
    const state = store.snapshot();
    assert.equal(state.request.tlang, 'tr');
    assert.deepEqual(state.counts, { parses: 0, playerResponses: 0, metadata: 0, xhr: 1, fetch: 1, timedtext: 2, rewrites: 0 });
    assert.equal(state.decision, null);
    const encoded = JSON.stringify(state);
    for (const secret of ['DO-NOT-KEEP', '1.2.3.4', 'https:']) assert.ok(!encoded.includes(secret));
});

test('parser rejects other endpoints and omits malformed values and unknown hosts', () => {
    assert.equal(redactCaptionRequest('https://www.youtube.com/youtubei/v1/player?key=secret'), null);
    assert.equal(redactCaptionRequest('https://www.youtube.com/api/timedtext/evil?lang=en'), null);
    assert.equal(redactCaptionRequest('http://www.youtube.com/api/timedtext?lang=en'), null);
    assert.deepEqual(redactCaptionRequest('https://secret.1.2.3.4/api/timedtext?v=credential&lang=secret%40mail.com&tlang=%EF%BF%BD&variant=secret&kind=secret&fmt=secret'),
        { host: 'diğer', queryKeys: ['fmt', 'kind', 'lang', 'tlang', 'v', 'variant'] });
    assert.deepEqual(redactCaptionRequest(`/api/timedtext?v=${videoId}&lang=en-US&tlang=tr&variant=timing-optimized&fmt=srv3`),
        { host: 'www.youtube.com', v: videoId, lang: 'en-US', tlang: 'tr', variant: 'timing-optimized', fmt: 'srv3',
            queryKeys: ['fmt', 'lang', 'tlang', 'v', 'variant'] });
    assert.deepEqual(redactCaptionRequest('/api/timedtext?lang=%ZZ&lang=tr&kind=asr'),
        { host: 'www.youtube.com', lang: 'tr', kind: 'asr', queryKeys: ['kind', 'lang'] });
});

test('metadata and decisions are sanitized, bounded, and do not retain raw payloads', () => {
    const store = createCaptionDiagnosticStore();
    const tracks = Array.from({ length: 80 }, () => ({ languageCode: 'en', kind: 'asr', dubbed: false, baseUrl: timedtext }));
    store.decision({ event: 'metadata', videoId, candidates: 1, tracks, audio: [{ account: 'secret' }] });
    store.decision({ event: 'request', action: 'unchanged', reason: 'no-exact-source-match',
        source: { v: videoId, lang: 'de-DE', sig: 'secret' }, queryKeys: ['secret'] });
    let state = store.snapshot();
    assert.equal(state.metadata.tracks.length, 16);
    assert.equal(state.decision.reason, 'no-exact-source-match');
    assert.ok(!JSON.stringify(state).includes('secret'));
    state.metadata.tracks[0].languageCode = 'changed';
    assert.equal(store.snapshot().metadata.tracks[0].languageCode, 'en');
    store.decision({ event: 'metadata', videoId: 'other', candidates: Infinity, tracks: [{ languageCode: 'token@account', kind: 'secret' }] });
    state = store.snapshot();
    assert.equal(state.counts.metadata, 2);
    assert.equal(state.metadata.videoId, null);
    assert.equal(state.metadata.candidates, null);
    assert.equal(state.metadata.tracks[0].languageCode, null);
});

test('parse and hook counters distinguish missing metadata, missed requests, and overwritten hooks', () => {
    const store = createCaptionDiagnosticStore();
    store.runtime({ mode: 'rewrite', urlApiSupported: false, ignored: 'secret' });
    store.hooks({ xhr: true, fetch: false, parse: true, token: 'secret' });
    store.parse({ user: 'secret' });
    store.parse({ playerResponse: { videoDetails: { videoId }, captions: { playerCaptionsTracklistRenderer: {} } } });
    store.request('https://www.youtube.com/youtubei/v1/player?key=secret', 'xhr');
    const state = store.snapshot();
    assert.equal(state.counts.parses, 2);
    assert.equal(state.counts.playerResponses, 1);
    assert.equal(state.counts.xhr, 1);
    assert.equal(state.counts.timedtext, 0);
    assert.equal(state.mode, 'rewrite');
    assert.deepEqual(state.hooks, { xhr: true, fetch: false, parse: true });
    assert.ok(!JSON.stringify(state).includes('secret'));
});

test('UI distinguishes candidate selection from actual applied correction', () => {
    const store = createCaptionDiagnosticStore();
    store.request(timedtext, 'xhr');
    store.decision({ event: 'request', action: 'would-rewrite', target: { lang: 'en', tlang: 'tr' } });
    assert.match(captionDiagnosticLines(store.snapshot()).join('\n'), /Yeni kaynak adayı bulundu/);
    store.decision({ event: 'request', action: 'rewritten' });
    assert.deepEqual(store.snapshot().decision.target, { lang: 'en', tlang: 'tr' });
    assert.equal(store.snapshot().counts.rewrites, 1);
    assert.match(captionDiagnosticLines(store.snapshot()).join('\n'), /Kaynak değiştirildi \(kalite doğrulanmadı\)/);
    store.decision({ event: 'request', action: 'diagnostics-only' });
    assert.match(captionDiagnosticLines(store.snapshot()).join('\n'), /Tanı modu: değiştirilmedi/);
    store.request(timedtext, 'xhr');
    assert.equal(store.snapshot().decision, null);
    assert.match(captionDiagnosticLines(store.snapshot()).join('\n'), /İstek görüldü; karar yok/);
});

test('worst-case allowed diagnostic data remains below 4 KB', () => {
    const store = createCaptionDiagnosticStore();
    const maxLanguage = 'abc-12345678-12345678';
    store.decision({ event: 'metadata', videoId, candidates: 1,
        tracks: Array.from({ length: 80 }, () => ({ languageCode: maxLanguage, kind: 'manual', dubbed: true })) });
    store.request(`${timedtext}&${Array.from({ length: 100 }, (_, i) => `${'a'.repeat(33)}${i}=secret`).join('&')}`, 'xhr');
    store.decision({ event: 'request', action: 'would-rewrite', reason: 'missing-or-ambiguous-asr',
        source: { v: videoId, lang: maxLanguage, tlang: maxLanguage, kind: 'manual', variant: 'timing-optimized', fmt: 'json3' },
        target: { v: videoId, lang: maxLanguage, tlang: maxLanguage, kind: 'manual', variant: 'timing-optimized', fmt: 'json3' } });
    store.player({ available: true, videoId, track: { languageCode: maxLanguage, kind: 'manual', translationLanguage: { languageCode: maxLanguage } },
        tracks: Array.from({ length: 100 }, () => ({ languageCode: maxLanguage, kind: 'manual', translationLanguage: { languageCode: maxLanguage } })) });
    assert.ok(JSON.stringify(store.snapshot()).length < 4096, `snapshot bytes: ${JSON.stringify(store.snapshot()).length}`);
    assert.equal(store.snapshot().request.queryKeys.length, 24);
});

test('selected player track is redacted and distinguishes source and target language', () => {
    const store = createCaptionDiagnosticStore();
    store.player({ available: true, videoId, track: { languageCode: 'en', kind: 'asr', vss_id: 'a.en',
        baseUrl: timedtext, translationLanguage: { languageCode: 'tr', baseUrl: timedtext, name: 'secret' } },
        tracks: [{ languageCode: 'de-DE', kind: 'asr', baseUrl: timedtext }] });
    const state = store.snapshot();
    assert.deepEqual(state.player, { available: true, videoId,
        track: { languageCode: 'en', kind: 'asr', targetLanguage: 'tr' }, trackCount: 1,
        tracks: [{ languageCode: 'de-DE', kind: 'asr', targetLanguage: null }] });
    assert.match(captionDiagnosticLines(state).join('\n'), /Oynatıcı: en → tr \/ asr/);
    assert.ok(!JSON.stringify(state).includes('secret'));
    assert.ok(!JSON.stringify(state).includes('baseUrl'));
    state.player.track.languageCode = 'changed';
    assert.equal(store.snapshot().player.track.languageCode, 'en');
    store.player({ available: false, videoId: 'secret', track: { languageCode: 'secret@mail', kind: 'secret',
        translationLanguage: { languageCode: 'secret@mail', token: 'secret' } } });
    assert.equal(store.snapshot().player.videoId, null);
    assert.equal(store.snapshot().player.track.targetLanguage, null);
    assert.match(captionDiagnosticLines(store.snapshot()).join('\n'), /Oynatıcı: bekleniyor/);
});

test('important dynamic parameter names survive the bounded query-key list', () => {
    const junk = Array.from({ length: 80 }, (_, i) => `field_${i}=secret`).join('&');
    const request = redactCaptionRequest(`/api/timedtext?${junk}&xorb=secret&xobt=secret&xovt=secret&c=secret&cver=secret&cplayer=secret`);
    for (const key of ['xorb', 'xobt', 'xovt', 'c', 'cver', 'cplayer']) assert.ok(request.queryKeys.includes(key));
    assert.equal(request.queryKeys.length, 24);
    assert.ok(!JSON.stringify(request).includes('secret'));
});
