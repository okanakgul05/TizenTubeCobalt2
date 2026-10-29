package android.os;
import java.util.ArrayList;
import java.util.List;
public final class Handler {
    private static final List<Runnable> QUEUE = new ArrayList<Runnable>();
    public Handler(Looper ignored) {}
    public boolean post(Runnable task) { QUEUE.add(task); return true; }
    public boolean postDelayed(Runnable task, long ignored) { return post(task); }
    public void removeCallbacks(Runnable task) {
        while (QUEUE.remove(task)) {}
    }
    public static void reset() { QUEUE.clear(); }
    public static boolean runNext() {
        if (QUEUE.isEmpty()) return false;
        QUEUE.remove(0).run();
        return true;
    }
    public static int drain(int maximum) {
        int count = 0;
        while (count < maximum && runNext()) count++;
        return count;
    }
    public static int pending() { return QUEUE.size(); }
}
