package android.util;
public final class Log {
    public static int errors;
    public static int i(String tag, String message) { return 0; }
    public static int e(String tag, String message) { errors++; return 0; }
    public static int e(String tag, String message, Throwable error) { errors++; return 0; }
}
