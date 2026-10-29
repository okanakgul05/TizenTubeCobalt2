package org.chromium.content_public.browser;
public abstract class WebContentsObserver {
    public WebContentsObserver(WebContents contents) {}
    public void primaryMainDocumentElementAvailable() {}
    public void documentLoadedInPrimaryMainFrame(Page p, GlobalRenderFrameHostId i, int s) {}
    public void didFinishLoadInPrimaryMainFrame(Page p, GlobalRenderFrameHostId i,
            org.chromium.url.GURL u, boolean v, int s) {}
    public void webContentsDestroyed() {}
}
