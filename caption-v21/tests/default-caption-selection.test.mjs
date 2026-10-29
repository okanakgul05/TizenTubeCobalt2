import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Replace only player discovery. The tests drive production logic through its
// public player APIs and deterministic event/poll delivery, without real timers.
const sourcePath = process.env.DEFAULT_CAPTION_SOURCE
    ? pathToFileURL(resolve(process.env.DEFAULT_CAPTION_SOURCE))
    : new URL('../mods/features/defaultTurkishCaptions.js', import.meta.url);
const source = (await readFile(sourcePath, 'utf8'))
    .replace("import { onPlayer } from '../utils/Player.js';", 'const onPlayer = () => {};');
const { installDefaultTurkishCaptions } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const EN = { languageCode: 'en', kind: 'asr', vss_id: 'a.en', is_translateable: true };
const ES = { languageCode: 'es', vss_id: '.es', is_translateable: true };
const FR = { ...EN, translationLanguage: { languageCode: 'fr', languageName: 'French' } };
const copy = value => JSON.parse(JSON.stringify(value));

function fixture({ on = true, current = EN, videoId = 'video-a', tracks = [EN, ES] } = {}) {
    const polls = new Map();
    const tasks = new Map();
    const players = [];
    let active;
    let nextPoll = 0;
    let nextTask = 0;
    const makePlayer = (options = {}) => {
        const state = {
            on, current: copy(current), videoId, tracks: copy(tracks), unavailableData: false, dataExtra: {},
            ...options
        };
        const calls = [];
        const listeners = new Map();
        const player = {
            isConnected: true,
            getVideoData: () => state.unavailableData ? {} : { video_id: state.videoId, ...state.dataExtra },
            getPlayerResponse: () => ({ videoDetails: { videoId: state.videoId },
                captions: { playerCaptionsTracklistRenderer: { captionTracks: state.tracks.map(track => ({
                    ...track, vssId: track.vss_id
                })) } } }),
            isSubtitlesOn: () => state.on,
            getOption: (module, key) => {
                assert.equal(module, 'captions');
                return key === 'track' ? state.current : key === 'tracklist' ? state.tracks : undefined;
            },
            setOption: (module, key, value) => {
                assert.equal(module, 'captions'); assert.equal(key, 'track');
                calls.push(copy(value)); state.current = copy(value);
                // Captured native Mf6 returns an empty string on success.
                return '';
            },
            addEventListener: (event, listener) => {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event).add(listener);
            },
            removeEventListener: (event, listener) => listeners.get(event)?.delete(listener)
        };
        const model = { player, state, calls, listeners,
            emit(event = 'captionschanged') {
                for (const listener of Array.from(listeners.get(event) || [])) listener(state.current);
            }
        };
        players.push(model);
        return model;
    };
    active = makePlayer();
    const view = {
        document: { querySelector: () => active.player },
        setInterval: callback => { polls.set(++nextPoll, callback); return nextPoll; },
        clearInterval: id => polls.delete(id),
        setTimeout: callback => { tasks.set(++nextTask, callback); return nextTask; },
        clearTimeout: id => tasks.delete(id)
    };
    const install = installDefaultTurkishCaptions(active.player, view);
    return { install, players, polls, tasks,
        get active() { return active; },
        poll() { for (const callback of Array.from(polls.values())) callback(); },
        endTask() { for (const [id, callback] of Array.from(tasks)) { tasks.delete(id); callback(); } },
        replace(options) { active.player.isConnected = false; active = makePlayer(options); return active; }
    };
}

function assertTurkishOnce(env) {
    assert.equal(env.active.calls.length, 1);
    assert.equal(env.active.calls[0].translationLanguage?.languageCode, 'tr');
}

test('CC starts off without mutations and selects Turkish once after native activation', () => {
    const env = fixture({ on: false });
    try {
        for (let i = 0; i < 4; i++) { env.active.emit(); env.poll(); env.endTask(); }
        assert.deepEqual(env.active.calls, []);
        assert.equal(env.active.state.on, false);
        env.active.state.on = true; env.active.emit();
        assertTurkishOnce(env);
        for (const event of ['onApiChange', 'onCaptionsModuleAvailable', 'onCaptionsTrackListChanged',
            'videodatachange', 'onStateChange', 'captionschanged']) env.active.emit(event);
        env.poll(); assertTurkishOnce(env);
    } finally { env.install.dispose(); }
});

for (const [name, manual] of [['original English', EN], ['other original language', ES], ['other translation', FR]]) {
    for (const delivery of ['event', 'poll']) {
        test(`${name} survives transient caption unload observed by ${delivery}`, () => {
            const env = fixture();
            try {
                assertTurkishOnce(env);
                const model = env.active;
                // Native language changes can unload the module before loading
                // the user's track. isSubtitlesOn then temporarily reports false.
                model.state.on = false;
                model.state.current = {};
                const available = model.state.tracks; model.state.tracks = [];
                if (delivery === 'event') model.emit(); else env.poll();
                assert.equal(model.calls.length, 1, 'unloaded captions must not be enabled');
                model.state.on = true; model.state.current = copy(manual); model.state.tracks = available;
                // The captured native OR unload/load completes in one task.
                // The deferred check must read its final enabled state even
                // before a follow-up ready event reaches our observer.
                env.endTask();
                model.emit('onCaptionsModuleAvailable'); model.emit(); env.poll();
                assert.equal(model.calls.length, 1, 'the initial default must not override a manual language');
                assert.deepEqual(model.state.current, manual);
            } finally { env.install.dispose(); }
        });
    }
}

test('manual CC off stays off and the next real CC activation selects Turkish again', () => {
    const env = fixture();
    try {
        assertTurkishOnce(env);
        env.active.state.current = copy(ES); env.active.emit();
        env.active.state.on = false; env.active.state.current = {}; env.active.emit(); env.poll();
        env.endTask();
        assert.equal(env.active.state.on, false);
        assert.equal(env.active.calls.length, 1);
        env.active.state.on = true; env.active.state.current = copy(ES); env.active.emit(); env.poll();
        assert.equal(env.active.calls.length, 2);
        assert.equal(env.active.state.current.translationLanguage?.languageCode, 'tr');
    } finally { env.install.dispose(); }
});

test('polling recovers a real CC off/on activation when native events are absent', () => {
    const env = fixture();
    try {
        assertTurkishOnce(env);
        env.active.state.current = copy(ES);
        env.active.state.on = false; env.poll(); env.endTask();
        assert.equal(env.active.state.on, false);
        assert.equal(env.active.calls.length, 1);
        env.active.state.on = true; env.poll(); env.endTask();
        assert.equal(env.active.calls.length, 2);
        assert.equal(env.active.state.current.translationLanguage?.languageCode, 'tr');
        env.poll(); assert.equal(env.active.calls.length, 2);
    } finally { env.install.dispose(); }
});

test('temporarily missing video metadata does not reset a manual language for the same video', () => {
    const env = fixture();
    try {
        assertTurkishOnce(env);
        env.active.state.current = copy(FR); env.active.emit();
        env.active.state.unavailableData = true; env.active.emit('videodatachange'); env.poll();
        env.active.state.unavailableData = false; env.active.emit('onStateChange'); env.poll();
        assert.equal(env.active.calls.length, 1);
        assert.deepEqual(env.active.state.current, FR);
    } finally { env.install.dispose(); }
});

test('a loaded default with an empty public track getter receives Turkish only once', () => {
    const env = fixture({ current: {} });
    try {
        assertTurkishOnce(env);
        // The native getter can return {} while a default track is loaded. It
        // can also do so briefly while applying a manual language selection.
        env.active.state.current = {};
        env.active.emit('onCaptionsModuleAvailable'); env.active.emit(); env.poll();
        assert.equal(env.active.calls.length, 1);
        env.active.state.current = copy(FR); env.active.emit(); env.poll();
        assert.equal(env.active.calls.length, 1);
        assert.deepEqual(env.active.state.current, FR);
    } finally { env.install.dispose(); }
});

for (const adFlag of ['is_ad', 'isAd']) {
    test(`${adFlag} with a different video ID does not reset the content's manual language`, () => {
        const env = fixture();
        try {
            assertTurkishOnce(env);
            env.active.state.current = copy(ES); env.active.emit();
            env.active.state.videoId = 'advertisement';
            env.active.state.dataExtra = { [adFlag]: true };
            env.active.state.current = copy(EN);
            env.active.emit('videodatachange'); env.poll();
            assert.equal(env.active.calls.length, 1, 'ads must not receive a caption default');
            env.active.state.videoId = 'video-a'; env.active.state.dataExtra = {};
            env.active.state.current = copy(ES);
            env.active.emit('videodatachange'); env.poll();
            assert.equal(env.active.calls.length, 1, 'returning from an ad must retain the handled video');
            assert.deepEqual(env.active.state.current, ES);
        } finally { env.install.dispose(); }
    });
}

test('a new video receives its own initial default once without forcing CC on', () => {
    const env = fixture();
    try {
        assertTurkishOnce(env);
        env.active.state.videoId = 'video-b'; env.active.state.on = false;
        env.active.state.current = {}; env.active.emit('videodatachange'); env.poll();
        assert.equal(env.active.calls.length, 1);
        assert.equal(env.active.state.on, false);
        env.active.state.on = true; env.active.state.current = copy(EN); env.active.emit(); env.poll();
        assert.equal(env.active.calls.length, 2);
        assert.equal(env.active.calls[1].translationLanguage?.languageCode, 'tr');
    } finally { env.install.dispose(); }
});

test('same-video player replacement retains the manual choice and a new video resets the default', () => {
    const env = fixture();
    try {
        assertTurkishOnce(env);
        env.active.state.current = copy(ES); env.active.emit();
        const old = env.active;
        const next = env.replace({ current: copy(ES) }); env.poll(); next.emit();
        assert.deepEqual(next.calls, []);
        assert.deepEqual(next.state.current, ES);
        assert.equal(Array.from(old.listeners.values()).reduce((n, set) => n + set.size, 0), 0);
        const another = env.replace({ videoId: 'video-b', current: copy(EN) }); env.poll(); another.emit();
        assert.equal(another.calls.length, 1);
        assert.equal(another.calls[0].translationLanguage?.languageCode, 'tr');
    } finally { env.install.dispose(); }
    assert.equal(env.polls.size, 0);
    assert.equal(Array.from(env.active.listeners.values()).reduce((n, set) => n + set.size, 0), 0);
});

for (const transition of ['missing metadata', 'ad', 'player replacement']) {
    test(`a deferred OFF observation during ${transition} cannot reset a manual language`, () => {
        const env = fixture();
        try {
            assertTurkishOnce(env);
            env.active.state.current = copy(ES); env.active.emit();
            env.active.state.on = false; env.active.state.current = {}; env.active.emit();
            if (transition === 'missing metadata') env.active.state.unavailableData = true;
            if (transition === 'ad') {
                env.active.state.videoId = 'advertisement'; env.active.state.dataExtra = { is_ad: true };
            }
            if (transition === 'player replacement') env.replace({ on: true, current: copy(ES) });
            env.poll(); env.endTask();
            env.active.state.unavailableData = false;
            env.active.state.videoId = 'video-a'; env.active.state.dataExtra = {};
            env.active.state.on = true; env.active.state.current = copy(ES);
            env.active.emit(); env.poll(); env.endTask();
            assert.equal(env.players.reduce((n, model) => n + model.calls.length, 0), 1);
            assert.deepEqual(env.active.state.current, ES);
        } finally { env.install.dispose(); }
    });
}

test('disposal cancels a pending OFF check and all polling/listeners', () => {
    const env = fixture();
    assertTurkishOnce(env);
    env.active.state.on = false; env.active.state.current = {}; env.active.emit();
    env.install.dispose();
    assert.equal(env.tasks.size, 0);
    assert.equal(env.polls.size, 0);
    assert.equal(Array.from(env.active.listeners.values()).reduce((n, set) => n + set.size, 0), 0);
    env.endTask(); env.poll();
    assert.equal(env.active.calls.length, 1);
    assert.equal(env.active.state.on, false);
});
