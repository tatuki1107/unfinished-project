package javelin.ui;

import java.util.function.UnaryOperator;

public interface Resource<T> {
    boolean loading();
    boolean hasValue();
    T get();
    String errorMessage();
    void reload();
    void mutate(T value);
    void mutate(UnaryOperator<T> updater);
    void cancel();
}
