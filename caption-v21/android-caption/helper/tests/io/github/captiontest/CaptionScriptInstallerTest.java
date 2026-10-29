package io.github.captiontest;

import android.os.Handler;
import dev.cobalt.coat.CobaltActivity;
import org.chromium.content_public.browser.JavaScriptCallback;
import org.chromium.content_public.browser.WebContents;
import org.chromium.content_public.browser.WebContentsObserver;

/** Behavioral tests with fake Android and Chromium APIs; no Android runtime claim. */
public final class CaptionScriptInstallerTest {
    private static int passed;
    private static final class Owner extends CobaltActivity {
        WebContents active;
        @Override public WebContents getActiveWebContents() { return active; }
    }
    private static final class Contents implements WebContents {
        String readiness = "install";
        boolean destroyed;
        boolean installed;
        boolean noFrame;
        boolean stall;
        boolean throwApi;
        String insertionResult = "ready";
        int probes;
        int injections;
        String source;
        JavaScriptCallback delayed;
        final org.chromium.content_public.browser.RenderFrameHost frame =
                new org.chromium.content_public.browser.RenderFrameHost() {
            @Override public void executeJavaScriptInIsolatedWorld(
                    String script, int worldId, JavaScriptCallback callback) {
                check(worldId == 1, "Only the supported positive isolated world is used");
                if (throwApi) throw new RuntimeException("Test API failure");
                if (script.contains("script.textContent=body")) {
                    injections++;
                    source = script;
                    installed = "ready".equals(insertionResult);
                    callback.handleJavaScriptResult("\"" + insertionResult + "\"");
                } else {
                    probes++;
                    if (stall) { delayed = callback; return; }
                    callback.handleJavaScriptResult("\"" + (installed ? "ready" : readiness) + "\"");
                }
            }
        };
        @Override public boolean isDestroyed() { return destroyed; }
        @Override public org.chromium.content_public.browser.RenderFrameHost getMainFrame() {
            return noFrame ? null : frame;
        }
    }
    private static void reset() {
        Handler.reset();
        WebContentsObserver.ALL.clear();
        android.util.Log.errors = 0;
    }
    private static void check(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
    }
    private static WebContentsObserver observer() {
        return WebContentsObserver.ALL.get(WebContentsObserver.ALL.size() - 1);
    }
    private static void pass(String name) {
        passed++;
        System.out.println("PASS " + name);
    }
    private static void installsOncePerDocument() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(20);
        check(page.injections == 1 && owner.assets.opens == 1, "Initial injection/read count");
        observer().documentLoadedInPrimaryMainFrame(null, null, 0);
        observer().didFinishLoadInPrimaryMainFrame(null, null, null, true, 0);
        Handler.drain(20);
        check(page.injections == 1 && Handler.pending() == 0, "Duplicate callbacks must skip");
        page.installed = false;
        observer().primaryMainDocumentElementAvailable();
        Handler.drain(20);
        check(page.injections == 2 && owner.assets.opens == 1, "New document reuses asset string");
        check("caption-test/userScript.js".equals(owner.assets.lastPath), "Correct asset path");
        check(page.source.contains("window.__helperTestBundleWasRun=true;"), "Bundle included");
        check(page.source.contains("config.enableUpdater=false"), "Official updater disabled");
        check(page.source.contains("localStorage.getItem('ttCaptionSourceGuard')===null"),
                "Existing mode preference must be preserved");
        pass("once per document, cached asset, defaults preserved");
    }
    private static void waitsForDocumentReadiness() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        page.readiness = "wait";
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(4);
        check(page.injections == 0 && page.probes > 0, "Loading document injected prematurely");
        page.readiness = "install";
        Handler.drain(10);
        check(page.injections == 1 && Handler.pending() == 0, "Ready document did not install");
        pass("document readiness retry");
    }
    private static void handlesDelayedContentsAndReplacement() {
        reset();
        Owner owner = new Owner();
        CaptionScriptInstaller.start(owner);
        Handler.drain(3);
        check(WebContentsObserver.ALL.isEmpty(), "Observer attached to missing WebContents");
        Contents first = new Contents();
        owner.active = first;
        Handler.drain(10);
        check(first.injections == 1, "Delayed WebContents did not install");
        Contents second = new Contents();
        owner.active = second;
        first.destroyed = true;
        observer().webContentsDestroyed();
        Handler.drain(10);
        check(second.injections == 1, "Replacement WebContents did not install");
        pass("delayed WebContents and replacement");
    }
    private static void stopsForDestroyedActivity() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        owner.destroyed = true;
        Handler.drain(10);
        check(page.injections == 0 && Handler.pending() == 0, "Destroyed owner retained work");
        pass("destroyed Activity stops work");
    }
    private static void boundsRetriesAndSkipsOtherDocuments() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        page.readiness = "wait";
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(1000);
        check(page.probes == 400 && page.injections == 0 && Handler.pending() == 0,
                "Readiness retries must be bounded");
        page.readiness = "skip";
        int before = page.probes;
        observer().primaryMainDocumentElementAvailable();
        Handler.drain(1000);
        check(page.probes == before + 1 && Handler.pending() == 0, "Skip must not retry");
        pass("bounded readiness and immediate skip");
    }
    private static void boundsAttachmentAndContainsAssetFailure() {
        reset();
        Owner owner = new Owner();
        CaptionScriptInstaller.start(owner);
        Handler.drain(1000);
        check(Handler.pending() == 0 && android.util.Log.errors == 1, "Attach timeout not bounded");
        reset();
        owner = new Owner();
        Contents page = new Contents();
        owner.active = page;
        owner.assets.fail = true;
        CaptionScriptInstaller.start(owner);
        Handler.drain(10);
        check(page.injections == 0 && android.util.Log.errors == 1 && Handler.pending() == 0,
                "Asset failure escaped or caused unbounded retry");
        pass("bounded attachment and contained asset failure");
    }
    private static void containsApiAndDomFailures() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        page.throwApi = true;
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(20);
        check(android.util.Log.errors == 1 && Handler.pending() == 0,
                "Runtime API error must not escape or retry forever");
        reset();
        owner = new Owner();
        page = new Contents();
        page.insertionResult = "submitted";
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(20);
        check(page.injections == 1 && !page.installed && android.util.Log.errors == 1,
                "Unexecuted main-world script cannot count as success");
        pass("API exceptions and blocked DOM insertion are contained");
    }
    private static void callbackTimeoutAndStaleGeneration() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        page.stall = true;
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(4);
        JavaScriptCallback stale = page.delayed;
        check(stale != null && page.injections == 0, "Stalled callback setup failed");
        page.stall = false;
        observer().documentLoadedInPrimaryMainFrame(null, null, 0);
        Handler.drain(20);
        check(page.injections == 1 && page.installed, "New generation did not install");
        stale.handleJavaScriptResult("\"install\"");
        Handler.drain(20);
        check(page.injections == 1 && Handler.pending() == 0, "Stale callback reused old page");
        reset();
        owner = new Owner();
        page = new Contents();
        page.stall = true;
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(2000);
        check(Handler.pending() == 0 && android.util.Log.errors == 1,
                "Lost callbacks must stop after bounded timeout retries");
        pass("callback timeouts and stale generations");
    }
    private static void waitsForMissingMainFrame() {
        reset();
        Owner owner = new Owner();
        Contents page = new Contents();
        page.noFrame = true;
        owner.active = page;
        CaptionScriptInstaller.start(owner);
        Handler.drain(3);
        check(page.probes == 0 && page.injections == 0, "Missing frame was used");
        page.noFrame = false;
        Handler.drain(20);
        check(page.installed, "Available frame did not resume installation");
        pass("delayed main frame");
    }
    public static void main(String[] ignored) throws Exception {
        if (ignored.length == 2 && "--dump".equals(ignored[0])) {
            java.lang.reflect.Constructor<CaptionScriptInstaller> constructor =
                    CaptionScriptInstaller.class.getDeclaredConstructor(CobaltActivity.class);
            constructor.setAccessible(true);
            Object helper = constructor.newInstance(new Owner());
            java.lang.reflect.Method method = CaptionScriptInstaller.class.getDeclaredMethod("loadInsertionScript");
            method.setAccessible(true);
            String script = (String) method.invoke(helper);
            java.nio.file.Files.write(java.nio.file.Paths.get(ignored[1]), script.getBytes("UTF-8"));
            return;
        }
        installsOncePerDocument();
        waitsForDocumentReadiness();
        handlesDelayedContentsAndReplacement();
        stopsForDestroyedActivity();
        boundsRetriesAndSkipsOtherDocuments();
        boundsAttachmentAndContainsAssetFailure();
        containsApiAndDomFailures();
        callbackTimeoutAndStaleGeneration();
        waitsForMissingMainFrame();
        System.out.println(passed + " helper behavior tests passed (fake runtime).");
    }
}
