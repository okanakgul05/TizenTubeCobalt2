package org.chromium.content_public.browser;
public interface WebContents {
    boolean isDestroyed();
    RenderFrameHost getMainFrame();
}
