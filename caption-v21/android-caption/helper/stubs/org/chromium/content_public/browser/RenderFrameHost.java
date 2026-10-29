package org.chromium.content_public.browser;
public interface RenderFrameHost {
    void executeJavaScriptInIsolatedWorld(String script, int worldId, JavaScriptCallback callback);
}
