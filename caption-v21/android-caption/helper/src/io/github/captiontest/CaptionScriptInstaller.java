/* Experimental Android caption test helper. Apache License, Version 2.0. */
package io.github.captiontest;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import dev.cobalt.coat.CobaltActivity;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import org.chromium.content_public.browser.GlobalRenderFrameHostId;
import org.chromium.content_public.browser.JavaScriptCallback;
import org.chromium.content_public.browser.Page;
import org.chromium.content_public.browser.RenderFrameHost;
import org.chromium.content_public.browser.WebContents;
import org.chromium.content_public.browser.WebContentsObserver;
import org.chromium.url.GURL;

/** Uses the isolated-world API actually registered in the official APK. */
public final class CaptionScriptInstaller {
    private static final String TAG = "TizenCaptionTest";
    private static final String ASSET_NAME = "caption-test/userScript.js";
    private static final String ATTRIBUTE = "data-tt-caption-bundle";
    private static final int WORLD_ID = 1;
    private static final int MAX_ATTACH_ATTEMPTS = 600;
    private static final int MAX_PROBE_RETRIES = 400;
    private static final String SCOPE =
            "location.protocol==='https:'&&(location.hostname==='youtube.com'||"
            + "location.hostname==='www.youtube.com')";
    private static final String PROBE =
            "(function(){if(!(" + SCOPE + "))return 'skip';"
            + "var root=document.documentElement;if(!root||document.readyState!=='complete')"
            + "return 'wait:document';var state=root.getAttribute('" + ATTRIBUTE + "');"
            + "if(state==='ready'||state==='failed')return state;"
            + "var scripts=document.querySelectorAll('script[nonce]');"
            + "for(var i=0;i<scripts.length;i++)if(scripts[i].nonce)return 'install';"
            + "return 'wait:nonce';})()";

    private final WeakReference<CobaltActivity> activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebContents contents;
    private WebContentsObserver observer;
    private String insertionScript;
    private String lastState;
    private int attachAttempts;
    private int probeRetries;
    private long generation;
    private boolean operationInFlight;
    private final Runnable attachTask = new Runnable() {
        @Override public void run() { attachWhenReady(); }
    };
    private final Runnable probeTask = new Runnable() {
        @Override public void run() { probe(); }
    };
    private final Runnable timeoutTask = new Runnable() {
        @Override public void run() {
            if (!operationInFlight) return;
            generation++;
            operationInFlight = false;
            retry("wait:callback-timeout");
        }
    };

    private CaptionScriptInstaller(CobaltActivity owner) {
        activity = new WeakReference<CobaltActivity>(owner);
    }
    public static void start(CobaltActivity owner) {
        CaptionScriptInstaller installer = new CaptionScriptInstaller(owner);
        installer.handler.post(installer.attachTask);
    }
    private boolean ownerAlive() {
        CobaltActivity owner = activity.get();
        return owner != null && !owner.isFinishing() && !owner.isDestroyed();
    }
    private void state(String value) {
        if (!value.equals(lastState)) {
            lastState = value;
            Log.i(TAG, "Bundled script state: " + value);
        }
    }
    private void invalidateOperation() {
        generation++;
        operationInFlight = false;
        handler.removeCallbacks(timeoutTask);
    }
    private void attachWhenReady() {
        if (!ownerAlive()) return;
        CobaltActivity owner = activity.get();
        WebContents candidate = owner.getActiveWebContents();
        if (candidate == null || candidate.isDestroyed()) {
            if (++attachAttempts < MAX_ATTACH_ATTEMPTS) handler.postDelayed(attachTask, 100);
            else Log.e(TAG, "WebContents unavailable after 60 seconds; script not installed.");
            return;
        }
        contents = candidate;
        observer = new WebContentsObserver(candidate) {
            @Override public void primaryMainDocumentElementAvailable() { requestProbe(); }
            @Override public void documentLoadedInPrimaryMainFrame(
                    Page p, GlobalRenderFrameHostId id, int s) { requestProbe(); }
            @Override public void didFinishLoadInPrimaryMainFrame(
                    Page p, GlobalRenderFrameHostId id, GURL u, boolean v, int s) { requestProbe(); }
            @Override public void webContentsDestroyed() {
                invalidateOperation();
                handler.removeCallbacks(probeTask);
                contents = null;
                observer = null;
                if (ownerAlive()) {
                    attachAttempts = 0;
                    handler.postDelayed(attachTask, 100);
                }
            }
        };
        Log.i(TAG, "Bundled script observer attached (isolated-world API).");
        requestProbe();
    }
    private void requestProbe() {
        if (!ownerAlive()) return;
        invalidateOperation();
        probeRetries = MAX_PROBE_RETRIES;
        handler.removeCallbacks(probeTask);
        handler.post(probeTask);
    }
    private void retry(String reason) {
        state(reason);
        if (!ownerAlive() || contents == null || contents.isDestroyed()) return;
        if (--probeRetries <= 0) {
            Log.e(TAG, "Bundled script readiness timed out; last state: " + reason);
            return;
        }
        handler.removeCallbacks(probeTask);
        handler.postDelayed(probeTask, 150);
    }
    private void probe() {
        if (!ownerAlive() || contents == null || contents.isDestroyed() || operationInFlight) return;
        final WebContents target = contents;
        execute(target, PROBE, new JavaScriptCallback() {
            @Override public void handleJavaScriptResult(String result) {
                if ("\"install\"".equals(result)) inject(target);
                else if ("\"ready\"".equals(result)) state("ready");
                else if ("\"failed\"".equals(result)) fail("Main-world script reported failure.");
                else if ("\"skip\"".equals(result)) state("skip:non-YouTube-document");
                else retry("probe:" + String.valueOf(result));
            }
        });
    }
    private void fail(String reason) {
        probeRetries = 0;
        handler.removeCallbacks(probeTask);
        state("failed");
        Log.e(TAG, reason);
    }
    private void execute(final WebContents target, String script, final JavaScriptCallback result) {
        if (target != contents || target.isDestroyed() || !ownerAlive()) return;
        final long token = ++generation;
        operationInFlight = true;
        handler.postDelayed(timeoutTask, 3000);
        try {
            RenderFrameHost frame = target.getMainFrame();
            if (frame == null) {
                invalidateOperation();
                retry("wait:main-frame");
                return;
            }
            frame.executeJavaScriptInIsolatedWorld(script, WORLD_ID, new JavaScriptCallback() {
                @Override public void handleJavaScriptResult(String jsonResult) {
                    if (token != generation) return;
                    invalidateOperation();
                    if (target != contents || target.isDestroyed() || !ownerAlive()) return;
                    result.handleJavaScriptResult(jsonResult);
                }
            });
        } catch (RuntimeException error) {
            invalidateOperation();
            fail("Isolated-world API failed: " + error);
        } catch (LinkageError error) {
            invalidateOperation();
            fail("Isolated-world API unavailable: " + error);
        }
    }
    private String loadInsertionScript() throws Exception {
        if (insertionScript != null) return insertionScript;
        CobaltActivity owner = activity.get();
        if (owner == null) throw new IllegalStateException("Activity destroyed");
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        InputStream stream = owner.getAssets().open(ASSET_NAME);
        try {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
        } finally { stream.close(); }
        String source = new String(bytes.toByteArray(), "UTF-8");
        String mainScript = "(function(){if(!(" + SCOPE + "))return;"
                + "var root=document.documentElement;if(!root)return;"
                + "function status(value){root.setAttribute('" + ATTRIBUTE + "',value);}"
                + "if(window.__ttCaptionBundledStatus==='ready'){status('ready');return;}"
                + "if(window.__ttCaptionBundledStatus==='failed'){status('failed');return;}"
                + "if(!window.h5vcc||typeof h5vcc.tizentube!=='object'){status('wait:bridge');return;}"
                + "var mappings=window._yttv&&Object.values(window._yttv).find(function(v){"
                + "return v&&v.mappings&&typeof v.get==='function';});"
                + "if(!mappings||!mappings.get('PlayerService')||"
                + "!mappings.get('PlaybackPreviewService')){status('wait:youtube');return;}"
                + "window.__ttCaptionBundledStatus='starting';status('starting');try{"
                + "if(localStorage.getItem('ttCaptionSourceGuard')===null)"
                + "localStorage.setItem('ttCaptionSourceGuard','rewrite');"
                + "(function(){var config;try{config=JSON.parse(localStorage.getItem("
                + "'ytaf-configuration')||'{}')}catch(_){config={}}"
                + "if(!config||typeof config!=='object'||Array.isArray(config))config={};"
                + "config.enableUpdater=false;localStorage.setItem('ytaf-configuration',"
                + "JSON.stringify(config));})();\n" + source
                + "\n;window.__ttCaptionBundledStatus='ready';status('ready');"
                + "console.info('[TizenTube Caption Test] Bundled script installed.');"
                + "}catch(error){window.__ttCaptionBundledStatus='failed';status('failed');"
                + "console.error('[TizenTube Caption Test] Script failed:',String(error));}})();";
        insertionScript = "(function(){if(!(" + SCOPE + "))return 'skip';"
                + "var root=document.documentElement;if(!root)return 'wait:document';"
                + "if(root.getAttribute('" + ATTRIBUTE + "')==='ready')return 'ready';"
                + "var scripts=document.querySelectorAll('script[nonce]'),nonce='';"
                + "for(var i=0;i<scripts.length;i++){if(scripts[i].nonce){nonce=scripts[i].nonce;break;}}"
                + "if(!nonce)return 'wait:nonce';"
                + "root.setAttribute('" + ATTRIBUTE + "','submitted');"
                + "try{var script=document.createElement('script');script.nonce=nonce;var body="
                + quote(mainScript) + ";if(window.trustedTypes){var policy=window.__ttCaptionScriptPolicy;"
                + "if(!policy){policy=trustedTypes.createPolicy('ttCaptionBundle',{createScript:function(s){return s;}});"
                + "window.__ttCaptionScriptPolicy=policy;}body=policy.createScript(body);}"
                + "script.textContent=body;(document.head||root).appendChild(script);script.remove();"
                + "return root.getAttribute('" + ATTRIBUTE + "')||'blocked';"
                + "}catch(e){return 'failed:dom-insertion:'+String(e);}})()";
        return insertionScript;
    }
    private static String quote(String value) {
        StringBuilder out = new StringBuilder(value.length() + 100);
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') { out.append('\\'); out.append(c); }
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else if (c < 32 || c == '\u2028' || c == '\u2029') {
                String hex = Integer.toHexString(c);
                out.append("\\u");
                for (int pad = hex.length(); pad < 4; pad++) out.append('0');
                out.append(hex);
            } else out.append(c);
        }
        return out.append('"').toString();
    }
    private void inject(WebContents target) {
        try {
            state("submitting");
            execute(target, loadInsertionScript(), new JavaScriptCallback() {
                @Override public void handleJavaScriptResult(String result) {
                    if ("\"ready\"".equals(result)) {
                        state("ready");
                        probeRetries = 0;
                        handler.removeCallbacks(probeTask);
                        Log.i(TAG, "Bundled script installed and main-world completion verified.");
                    } else if (result != null && result.startsWith("\"failed"))
                        fail("Main-world installation failed: " + result);
                    else if ("\"skip\"".equals(result)) state("skip:navigation-changed");
                    else if ("\"submitted\"".equals(result) || "\"blocked\"".equals(result))
                        fail("Inline script did not run; CSP or parsing blocked installation.");
                    else retry("insert:" + String.valueOf(result));
                }
            });
        } catch (Exception error) { fail("Could not load bundled script: " + error); }
    }
}
