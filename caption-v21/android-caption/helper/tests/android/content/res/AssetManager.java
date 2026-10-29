package android.content.res;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
public final class AssetManager {
    public int opens;
    public boolean fail;
    public String lastPath;
    public InputStream open(String path) throws IOException {
        opens++;
        lastPath = path;
        if (fail) throw new IOException("Test asset unavailable");
        return new ByteArrayInputStream("window.__helperTestBundleWasRun=true;".getBytes("UTF-8"));
    }
}
