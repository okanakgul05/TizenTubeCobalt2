package android.app;
public class Activity {
    public boolean finishing;
    public boolean destroyed;
    public final android.content.res.AssetManager assets = new android.content.res.AssetManager();
    public boolean isFinishing() { return finishing; }
    public boolean isDestroyed() { return destroyed; }
    public android.content.res.AssetManager getAssets() { return assets; }
}
