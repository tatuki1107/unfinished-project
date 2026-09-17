package javelin.ui;

public interface FormField<T> {
    T get();
    void set(T value);
    String error();
    boolean valid();
    boolean touched();
    Object input();
    void reset();
}
