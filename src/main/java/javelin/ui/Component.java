package javelin.ui;

import java.util.List;
import java.util.function.Function;

public abstract class Component<P> {
    protected Component() {
    }

    protected P props() {
        throw runtimeOnly();
    }

    protected <T> State<T> state(T initialValue) {
        throw runtimeOnly();
    }

    protected <T> void provideContext(Context<T> context, T value) {
        throw runtimeOnly();
    }

    protected <T> T useContext(Context<T> context) {
        throw runtimeOnly();
    }

    protected Object[] children() {
        throw runtimeOnly();
    }

    protected <T> Resource<T> resource(String url, Function<JsonValue, T> decoder) {
        throw runtimeOnly();
    }

    protected <T> Resource<T> resource(String url, Function<JsonValue, T> decoder, ResourceOptions options) {
        throw runtimeOnly();
    }

    protected <T> Resource<T> resource(String method, String url, Object body, Function<JsonValue, T> decoder) {
        throw runtimeOnly();
    }

    protected <T> Resource<T> resource(String method, String url, Object body, Function<JsonValue, T> decoder, ResourceOptions options) {
        throw runtimeOnly();
    }

    protected ResourceOptions resourceOptions() {
        throw runtimeOnly();
    }

    protected FormField<String> field(String initialValue, Function<String, String> validator) {
        throw runtimeOnly();
    }

    protected <T> FormField<T> field(T initialValue, Function<String, T> parser, Function<T, String> validator) {
        throw runtimeOnly();
    }

    protected void effect(Effect effect, List<?> dependencies) {
        throw runtimeOnly();
    }

    protected void onMount(Runnable callback) {
        throw runtimeOnly();
    }

    protected void onUnmount(Runnable callback) {
        throw runtimeOnly();
    }

    protected void mounted() {
    }

    protected void unmounted() {
    }

    protected boolean shouldUpdate(P previousProps, P nextProps) {
        return true;
    }

    protected VNode fallback(Throwable error) {
        throw new RuntimeException(error);
    }

    public abstract VNode render();

    private static UnsupportedOperationException runtimeOnly() {
        return new UnsupportedOperationException("Implemented by the JavaScript runtime");
    }

    @FunctionalInterface
    public interface Effect {
        Runnable run();
    }
}
