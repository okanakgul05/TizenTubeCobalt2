import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionSourceGuard } from '../mods/utils/captionSourceGuard.js';

const base = (lang, extra = '') => `https://www.youtube.com/api/timedtext?v=video1&lang=${lang}&kind=asr&sig=${lang}-signature${extra}`;
const dub = base('de-DE', '&variant=timing-optimized');
const original = base('en');
const translated = `${dub}&tlang=tr&fmt=json3`;
const track = (lang, url = base(lang)) => ({ languageCode: lang, kind: 'asr',
    isTranslatable: true, vssId: `a.${lang}`, baseUrl: url });
function response(tracks = [track('de-DE', dub), track('en', original)], formats = []) {
    return { videoDetails: { videoId: 'video1' },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks,
            audioTracks: [{ captionTrackIndices: [0, 1], defaultCaptionTrackIndex: 0 }] } },
        streamingData: { adaptiveFormats: formats } };
}
function ready(payload = response()) {
    const guard = createCaptionSourceGuard();
    guard.observe(payload);
    return guard;
}

test('recognized dubbed translation uses the full alternate signature, preserving target and format', () => {
    const url = new URL(ready().rewrite(translated));
    assert.equal(url.searchParams.get('lang'), 'en');
    assert.equal(url.searchParams.get('sig'), 'en-signature');
    assert.equal(url.searchParams.get('variant'), null);
    assert.equal(url.searchParams.get('tlang'), 'tr');
    assert.equal(url.searchParams.get('fmt'), 'json3');
});
test('audio isAutoDubbed identifies ASR even when timing variant is absent', () => {
    const guard = ready(response([track('de-DE'), track('en')], [
        { audioTrack: { id: 'DE-de.10', isAutoDubbed: true } }
    ]));
    assert.equal(new URL(guard.rewrite(`${base('de-DE')}&tlang=tr`)).searchParams.get('lang'), 'en');
});
test('direct dubbed captions, original captions and other targets remain unchanged', () => {
    for (const url of [dub, original, `${original}&tlang=tr`, `${dub}&tlang=fr`]) {
        assert.equal(ready().rewrite(url), url);
    }
});
test('absent or ambiguous alternatives do not fall back to a dubious source', () => {
    for (const tracks of [[track('de-DE', dub)], [track('de-DE', dub), track('en'), track('fr')], []]) {
        assert.equal(ready(response(tracks)).rewrite(translated), translated);
    }
});
test('manual caption tracks cannot be rewritten or selected as the ASR alternative', () => {
    const manual = { ...track('tr', base('tr')), kind: undefined };
    assert.equal(ready(response([track('de-DE', dub), manual])).rewrite(translated), translated);
    assert.equal(ready(response([manual, track('en')])).rewrite(`${base('tr')}&tlang=tr`), `${base('tr')}&tlang=tr`);
});
test('untranslatable and already translated alternatives are rejected', () => {
    for (const candidate of [{ ...track('en'), isTranslatable: false }, track('en', `${original}&tlang=fr`)]) {
        assert.equal(ready(response([track('de-DE', dub), candidate])).rewrite(translated), translated);
    }
});
test('video and every source-specific or unknown URL parameter must match', () => {
    for (const url of [translated.replace('v=video1', 'v=other'),
        translated.replace('de-DE-signature', 'different'), `${translated}&extra=unknown`,
        translated.replace('www.youtube.com', 'attacker.example')]) {
        assert.equal(ready().rewrite(url), url);
    }
});

test('actual TV player presentation and client fields do not hide the source and survive rewriting', () => {
    const input = `${translated}&xorb=2&xobt=3&xovt=3&xosf=1&c=TVHTML5&cver=7.20261019.14.00&cplayer=UNIPLAYER&cos=Android&cosver=12`;
    const result = new URL(ready().rewrite(input));
    assert.equal(result.searchParams.get('lang'), 'en');
    assert.equal(result.searchParams.get('sig'), 'en-signature');
    for (const key of ['fmt', 'tlang', 'xorb', 'xobt', 'xovt', 'xosf', 'c', 'cver', 'cplayer', 'cos', 'cosver'])
        assert.equal(result.searchParams.get(key), new URL(input).searchParams.get(key), key);
});

test('runtime names in signature parameter lists retain their binding', () => {
    for (const signatureList of ['sparams', 'lsparams']) {
        const signedDub = `${dub}&c=TVHTML5&${signatureList}=v,lang,c`;
        const guard = ready(response([track('de-DE', signedDub), track('en')]));
        const input = `${signedDub}&tlang=tr&fmt=json3`;
        assert.equal(guard.rewrite(input.replace('c=TVHTML5', 'c=WEB')), input.replace('c=TVHTML5', 'c=WEB'));
        const valid = new URL(guard.rewrite(input));
        assert.equal(valid.searchParams.get('lang'), 'en');
        assert.equal(valid.searchParams.get('c'), null);
        const target = `${original}&c=WEB&${signatureList}=v,lang,c`;
        const targetGuard = ready(response([track('de-DE', dub), track('en', target)]));
        assert.equal(new URL(targetGuard.rewrite(`${translated}&c=TVHTML5`)).searchParams.get('c'), 'WEB');
    }
});
test('query order can differ but regional language codes are not collapsed', () => {
    const reordered = new URL(translated);
    reordered.searchParams.sort();
    assert.equal(new URL(ready().rewrite(reordered.href)).searchParams.get('lang'), 'en');
    const guard = ready(response([track('de-DE', dub), track('en')], [
        { audioTrack: { id: 'en-US.10', isAutoDubbed: true } }
    ]));
    assert.equal(new URL(guard.rewrite(translated)).searchParams.get('lang'), 'en');
});
test('expired alternate URL is not used', () => {
    const guard = ready(response([track('de-DE', dub), track('en', `${original}&expire=1`)]));
    assert.equal(guard.rewrite(translated), translated);
});
test('new response replaces old signed-URL mappings; missing metadata is a no-op', () => {
    const guard = ready();
    guard.observe(response([track('de-DE', dub.replace('de-DE-signature', 'fresh')), track('en')]));
    assert.equal(guard.rewrite(translated), translated);
    const fresh = createCaptionSourceGuard();
    for (const payload of [null, {}, response([])]) fresh.observe(payload);
    assert.equal(fresh.rewrite(translated), translated);
});
test('observation never mutates track arrays or audio indices; logs omit signatures', () => {
    const payload = response();
    const before = JSON.stringify(payload);
    const logs = [];
    const guard = createCaptionSourceGuard(value => logs.push(value));
    guard.observe(payload);
    guard.rewrite(translated);
    assert.equal(JSON.stringify(payload), before);
    assert.doesNotMatch(JSON.stringify(logs), /signature|baseUrl|https:/);
});
test('XHR/fetch adapters default to diagnostics, preserve non-GET calls and Request options', async () => {
    const calls = [];
    let fetchPromise = null;
    globalThis.localStorage = { mode: null, getItem() { return this.mode; } };
    globalThis.XMLHttpRequest = class { open(...args) { calls.push(['xhr', ...args]); return 17; } };
    globalThis.window = { fetch: (...args) => { calls.push(['fetch', ...args]); return fetchPromise || Promise.resolve('ok'); } };
    const previousInfo = console.info;
    console.info = () => {};
    try {
        const feature = await import('../mods/features/captionSourceGuard.js');
        feature.observeCaptionSources(response());
        const xhr = new XMLHttpRequest();
        assert.equal(xhr.open('GET', translated, false, 'user', 'pass'), 17);
        assert.equal(calls.at(-1)[2], translated);
        localStorage.mode = 'rewrite';
        xhr.open('GET', translated, false, 'user', 'pass');
        assert.equal(new URL(calls.at(-1)[2]).searchParams.get('lang'), 'en');
        assert.deepEqual(calls.at(-1).slice(3), [false, 'user', 'pass']);
        const options = { method: 'POST', body: 'unchanged', headers: { custom: 'value' } };
        await window.fetch(translated, options);
        assert.equal(calls.at(-1)[1], translated);
        assert.equal(calls.at(-1)[2], options);
        const request = new Request(translated, { headers: { custom: 'value' }, credentials: 'include' });
        const init = { cache: 'no-store' };
        assert.equal(await window.fetch(request, init), 'ok');
        const forwarded = calls.at(-1)[1];
        assert.equal(new URL(forwarded.url).searchParams.get('lang'), 'en');
        assert.equal(forwarded.headers.get('custom'), 'value');
        assert.equal(forwarded.credentials, 'include');
        assert.equal(calls.at(-1)[2], init);
        await window.fetch(original, init);
        assert.equal(calls.at(-1)[1], original);

        // Player JSON can bypass the global parse hook. Observe only its clone;
        // the caller must still receive the same readable response/promise.
        globalThis.location = { href: 'https://www.youtube.com/tv', origin: 'https://www.youtube.com' };
        const payload = response();
        payload.videoDetails.videoId = 'video2';
        for (const item of payload.captions.playerCaptionsTracklistRenderer.captionTracks)
            item.baseUrl = item.baseUrl.replace('video1', 'video2');
        const playerResponse = new Response(JSON.stringify(payload));
        const playerPromise = Promise.resolve(playerResponse);
        fetchPromise = playerPromise;
        assert.equal(window.fetch('/youtubei/v1/player', { method: 'POST', body: '{}' }), playerPromise);
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(await playerResponse.text(), JSON.stringify(payload));
        const video2Request = translated.replace('video1', 'video2');
        const fetchXhr = new XMLHttpRequest();
        fetchXhr.open('GET', video2Request, true);
        assert.equal(new URL(calls.at(-1)[2]).searchParams.get('lang'), 'en');

        // The XHR listener is also an independent metadata observation path.
        payload.videoDetails.videoId = 'video3';
        for (const item of payload.captions.playerCaptionsTracklistRenderer.captionTracks)
            item.baseUrl = item.baseUrl.replace('video2', 'video3');
        calls.length = 0;
        const endpointXhr = new XMLHttpRequest();
        const listeners = [];
        endpointXhr.addEventListener = (type, callback) => listeners.push([type, callback]);
        endpointXhr.responseType = 'text';
        endpointXhr.responseText = JSON.stringify(payload);
        endpointXhr.open('POST', '/youtubei/v1/player', true);
        assert.equal(listeners.length, 1);
        assert.equal(listeners[0][0], 'load');
        listeners[0][1].call(endpointXhr);
        endpointXhr.open('GET', translated.replace('video1', 'video3'), true);
        assert.equal(new URL(calls.at(-1)[2]).searchParams.get('lang'), 'en');
        // Invalid endpoint content never escapes into the player's load event.
        endpointXhr.responseText = 'not json';
        assert.doesNotThrow(() => listeners[0][1].call(endpointXhr));
    } finally {
        console.info = previousInfo;
        delete globalThis.window;
        delete globalThis.localStorage;
        delete globalThis.XMLHttpRequest;
        delete globalThis.location;
    }
});
