import assert from 'node:assert/strict';
import test from 'node:test';
import { installCaptionPhraseBlocks, isCaptionRequest } from '../mods/features/captionPhraseBlocks.js';
import { transformCaptionPhraseBlocks } from '../mods/utils/captionPhraseBlocks.js';

const target = 'https://www.youtube.com/api/timedtext?v=video123456&lang=en&tlang=tr&fmt=json3&sig=unchanged';
const original = target.replace('&tlang=tr', '');
const unrelated = target.replace('/api/timedtext', '/api/player');

function fixture() {
    return { wireMagic: 'pb3', pens: [{}],
        wsWinStyles: [{}, { mhModeHint: 2, juJustifCode: 0, sdScrollDir: 3 }],
        wpWinPositions: [{}, { apPoint: 6, ahHorPos: 20, avVerPos: 100, rcRows: 2, ccCols: 40 }],
        events: [
            { id: 1, tStartMs: 0, dDurationMs: 10000, wpWinPosId: 1, wsWinStyleId: 1 },
            { wWinId: 1, tStartMs: 1000, dDurationMs: 3000,
                segs: [{ utf8: 'Bir' }, { utf8: ' örnek', tOffsetMs: 500 }, { utf8: ' cümle.', tOffsetMs: 1000 }] }
        ] };
}

function environment() {
    const calls = [];
    class XHR {
        constructor() { this.readyState = 0; this.status = 0; this.responseType = ''; this.responseURL = ''; this.raw = ''; }
        open(...args) {
            calls.push(['xhr', ...args]);
            if (args[1] === 'throw') throw new Error('native open failure');
            this.readyState = 1; this.status = 0; this.raw = ''; this.responseURL = '';
            return 17;
        }
        get responseText() {
            if (this.responseType !== '' && this.responseType !== 'text') throw new DOMException('native responseType error', 'InvalidStateError');
            return this.raw;
        }
        get response() { return this.raw; }
        complete(raw, responseType = '', status = 200, url = target) {
            this.raw = raw; this.responseType = responseType; this.status = status; this.responseURL = url; this.readyState = 4;
        }
        abort() { this.readyState = 0; this.status = 0; }
    }
    let promise = Promise.resolve(new Response(''));
    const view = { XMLHttpRequest: XHR, Request, Response, Headers,
        location: { href: 'https://www.youtube.com/tv' },
        fetch(...args) { calls.push(['fetch', ...args]); return promise; } };
    return { view, calls, setResponse(response) { promise = Promise.resolve(response); return promise; },
        setPromise(value) { promise = value; } };
}

function changedText() {
    const payload = fixture();
    const result = transformCaptionPhraseBlocks(payload);
    assert.notEqual(result, payload, 'fixture must exercise actual block conversion');
    return JSON.stringify(result);
}

test('JSON3 caption GET endpoints are eligible for originals and translations in every language', () => {
    for (const url of [target, original, original.replace('lang=en', 'lang=tr'),
        original.replace('lang=en', 'lang=ar'), original + '&kind=asr',
        target.replace('tlang=tr', 'tlang=de'), target.replace('tlang=tr', 'tlang='),
        target.replace('tlang=tr', 'tlang=%20')]) assert.equal(isCaptionRequest('get', url), true, url);
    assert.equal(isCaptionRequest('GET', '/api/timedtext?fmt=json3', 'https://www.youtube.com/tv'), true);
    for (const [method, url] of [['POST', target], ['GET', target.replace('json3', 'srv3')],
        ['GET', target.replace('&fmt=json3', '')],
        ['GET', target.replace('https:', 'http:')], ['GET', target.replace('www.youtube.com', 'example.com')],
        ['GET', target.replace('/api/timedtext', '/api/timedtext-extra')],
        ['GET', target.replace('www.youtube.com', 'www.youtube.com:8080')], ['GET', 'not a URL']]) {
        assert.equal(isCaptionRequest(method, url), false, method + ' ' + url);
    }
});

test('XHR text conversion preserves request arguments, completion semantics and cached consistency', () => {
    const { view, calls } = environment();
    const install = installCaptionPhraseBlocks(view);
    try {
        const xhr = new view.XMLHttpRequest();
        assert.equal(xhr.open('GET', target, false, 'user', 'password'), 17);
        assert.deepEqual(calls[0], ['xhr', 'GET', target, false, 'user', 'password']);
        const raw = JSON.stringify(fixture()); xhr.complete(raw);
        xhr.readyState = 3;
        assert.equal(xhr.responseText, raw, 'partial responses are untouched');
        xhr.readyState = 4;
        assert.equal(xhr.responseText, changedText());
        assert.equal(xhr.response, xhr.responseText);
        assert.equal(xhr.raw, raw, 'native body remains unchanged');
    } finally { install.dispose(); }
});

test('XHR JSON conversion caches the result while preserving native getter errors and non-text responses', () => {
    const { view } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const xhr = new view.XMLHttpRequest(); xhr.open('GET', target);
        const payload = fixture(); xhr.complete(payload, 'json');
        const converted = xhr.response;
        assert.notEqual(converted, payload);
        assert.deepEqual(converted, JSON.parse(changedText()));
        assert.equal(xhr.response, converted);
        assert.throws(() => xhr.responseText, { name: 'InvalidStateError' });
        const blob = new Blob(['binary']); xhr.complete(blob, 'blob');
        assert.equal(xhr.response, blob);
        assert.throws(() => xhr.responseText, { name: 'InvalidStateError' });
        const bytes = new ArrayBuffer(8); xhr.complete(bytes, 'arraybuffer'); assert.equal(xhr.response, bytes);
    } finally { install.dispose(); }
});

test('original ASR and translated tracks share the same XHR/fetch conversion without changing signed URLs', async () => {
    const { view, calls, setResponse } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const xhr = new view.XMLHttpRequest();
        for (const url of [original, original + '&kind=asr', target,
            original.replace('lang=en', 'lang=tr'), original.replace('lang=en', 'lang=ar'), original]) {
            xhr.open('GET', url); xhr.complete(JSON.stringify(fixture()), '', 200, url);
            assert.equal(xhr.responseText, changedText());
            assert.equal(calls.at(-1)[2], url, 'signed XHR URL stays exactly as selected');
            const response = new Response(JSON.stringify(fixture()));
            Object.defineProperty(response, 'url', { value: url }); setResponse(response);
            const converted = await view.fetch(url);
            assert.equal(await converted.text(), changedText());
            assert.equal(converted.url, url);
            assert.equal(calls.at(-1)[1], url, 'signed fetch URL stays exactly as selected');
        }
    } finally { install.dispose(); }
});

test('already complete manual original captions retain exact text, timing and fetch identity', async () => {
    const { view, setResponse } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const manual = { wireMagic: 'pb3', events: [
            { tStartMs: 1000, dDurationMs: 2400, segs: [{ utf8: 'A complete sentence.' }] },
            { tStartMs: 3600, dDurationMs: 2400, segs: [{ utf8: 'Another complete sentence.' }] }
        ] };
        const raw = JSON.stringify(manual);
        const xhr = new view.XMLHttpRequest(); xhr.open('GET', original); xhr.complete(raw, '', 200, original);
        assert.equal(xhr.responseText, raw);
        xhr.complete(manual, 'json', 200, original); assert.equal(xhr.response, manual);
        const response = new Response(raw); setResponse(response);
        assert.equal(await view.fetch(original), response);
        assert.equal(await response.text(), raw);
    } finally { install.dispose(); }
});

test('XHR unrelated requests, errors, malformed data and unrelated redirects remain native', () => {
    const { view } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const raw = JSON.stringify(fixture());
        for (const [method, url, status, body, finalUrl] of [
            ['GET', unrelated, 200, raw, unrelated], ['POST', target, 200, raw, target],
            ['GET', target, 429, raw, target], ['GET', target, 200, '<html>blocked</html>', target],
            ['GET', target, 200, raw, 'https://example.com/not-captions']]) {
            const xhr = new view.XMLHttpRequest(); xhr.open(method, url); xhr.complete(body, '', status, finalUrl);
            assert.equal(xhr.responseText, body);
        }
    } finally { install.dispose(); }
});

test('XHR abort, reuse and failed open cannot reuse a caption response or scope', () => {
    const { view } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const xhr = new view.XMLHttpRequest(); const raw = JSON.stringify(fixture());
        xhr.open('GET', target); xhr.complete(raw); assert.equal(xhr.responseText, changedText());
        xhr.abort(); assert.equal(xhr.responseText, raw);
        xhr.open('GET', unrelated); xhr.complete(raw, '', 200, unrelated); assert.equal(xhr.responseText, raw);
        xhr.open('GET', target); xhr.complete(raw); assert.equal(xhr.responseText, changedText());
        assert.throws(() => xhr.open('GET', 'throw'), /native open failure/);
        assert.equal(xhr.responseText, raw, 'failed open clears old caption scope');
    } finally { install.dispose(); }
});

test('fetch forwards the same Request/options and reconstructs only changed caption bodies', async () => {
    const { view, calls, setResponse } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const raw = JSON.stringify(fixture());
        const response = new Response(raw, { status: 200, statusText: 'OK',
            headers: { 'content-length': String(raw.length), 'content-encoding': 'gzip', 'x-test': 'preserved' } });
        Object.defineProperties(response, { url: { value: target }, redirected: { value: true }, type: { value: 'cors' } });
        setResponse(response);
        const request = new Request(target, { credentials: 'include', headers: { custom: 'kept' } });
        const init = { cache: 'no-store' };
        const converted = await view.fetch(request, init);
        assert.equal(calls.at(-1)[1], request); assert.equal(calls.at(-1)[2], init);
        assert.notEqual(converted, response);
        assert.equal(response.bodyUsed, false);
        assert.equal(converted.url, target); assert.equal(converted.redirected, true); assert.equal(converted.type, 'cors');
        assert.equal(converted.headers.get('x-test'), 'preserved');
        assert.equal(converted.headers.get('content-length'), null); assert.equal(converted.headers.get('content-encoding'), null);
        const clone = converted.clone(); assert.equal(clone.url, target); assert.equal(clone.clone().url, target);
        assert.deepEqual(await clone.json(), JSON.parse(changedText()));
        assert.equal(await converted.text(), changedText()); assert.equal(converted.bodyUsed, true);
        await assert.rejects(() => converted.text(), TypeError);
    } finally { install.dispose(); }
});

test('fetch no-op requests preserve the exact promise and response identities', async () => {
    const { view, setResponse } = environment(); const install = installCaptionPhraseBlocks(view);
    try {
        const response = new Response(JSON.stringify(fixture())); const promise = setResponse(response);
        assert.equal(view.fetch(unrelated), promise);
        assert.equal(view.fetch(target, { method: 'POST', body: '{}' }), promise);
        assert.equal(await view.fetch(unrelated), response);
        assert.equal(response.bodyUsed, false);
        for (const [body, status] of [['not JSON', 200], [JSON.stringify(fixture()), 429], [changedText(), 200]]) {
            const noOp = new Response(body, { status }); setResponse(noOp);
            assert.equal(await view.fetch(target), noOp); assert.equal(await noOp.text(), body);
        }
        const huge = new Response('unused', { headers: { 'content-length': '9000000' } });
        huge.clone = () => { throw new Error('must not read oversized response'); }; setResponse(huge);
        assert.equal(await view.fetch(target), huge);
    } finally { install.dispose(); }
});

test('fetch rejection and pending-response disposal retain native behavior', async () => {
    const { view, setPromise } = environment(); const install = installCaptionPhraseBlocks(view);
    const failure = new Error('network unavailable');
    setPromise(Promise.reject(failure));
    await assert.rejects(view.fetch(target), error => error === failure);
    let resolve;
    setPromise(new Promise(done => { resolve = done; }));
    const pending = view.fetch(target); install.dispose();
    const originalResponse = new Response(JSON.stringify(fixture())); resolve(originalResponse);
    assert.equal(await pending, originalResponse); assert.equal(originalResponse.bodyUsed, false);
});

test('an XHR-backed fetch polyfill does not transform a block response a second time', async () => {
    const { view } = environment();
    let polyfillResponse;
    view.fetch = function (url) {
        const xhr = new view.XMLHttpRequest(); xhr.open('GET', url);
        xhr.complete(JSON.stringify(fixture()));
        polyfillResponse = new Response(xhr.responseText);
        return Promise.resolve(polyfillResponse);
    };
    const install = installCaptionPhraseBlocks(view);
    try {
        const response = await view.fetch(target);
        assert.equal(response, polyfillResponse, 'the second transport sees an already converted no-op');
        assert.equal(await response.text(), changedText());
    } finally { install.dispose(); }
});

test('dispose restores owned descriptors and leaves later wrapper chains functional', async () => {
    const { view, setResponse } = environment(); const previousOpen = view.XMLHttpRequest.prototype.open;
    const previousGetter = Object.getOwnPropertyDescriptor(view.XMLHttpRequest.prototype, 'responseText');
    const previousFetch = view.fetch; const install = installCaptionPhraseBlocks(view);
    const ours = view.fetch; const later = function (...args) { return ours.apply(this, args); }; view.fetch = later;
    install.dispose(); install.dispose();
    assert.equal(view.XMLHttpRequest.prototype.open, previousOpen);
    assert.deepEqual(Object.getOwnPropertyDescriptor(view.XMLHttpRequest.prototype, 'responseText'), previousGetter);
    assert.equal(view.fetch, later);
    const response = new Response(JSON.stringify(fixture())); const promise = setResponse(response);
    assert.equal(view.fetch(target), promise); assert.equal(await view.fetch(target), response);
    const onlyFetch = { fetch: previousFetch, Response, Headers, Request };
    assert.doesNotThrow(() => installCaptionPhraseBlocks(onlyFetch).dispose());
});
