package org.chromium.content_public.browser;
import java.util.ArrayList;
import java.util.List;
public abstract class WebContentsObserver {
    public static final List<WebContentsObserver> ALL = new ArrayList<WebContentsObserver>();
    public WebContentsObserver(WebContents contents) { ALL.add(this); }
    public void primaryMainDocumentElementAvailable() {}
    public void documentLoadedInPrimaryMainFrame(Page p, GlobalRenderFrameHostId i, int s) {}
    public void didFinishLoadInPrimaryMainFrame(Page p, GlobalRenderFrameHostId i,
            org.chromium.url.GURL u, boolean v, int s) {}
    public void webContentsDestroyed() {}
}
