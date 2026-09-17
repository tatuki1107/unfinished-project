package javelin.ui;

import java.util.List;

public interface JsonValue {
    Object raw();
    String string(String name);
    int integer(String name);
    double number(String name);
    boolean bool(String name);
    JsonValue object(String name);
    List<JsonValue> array(String name);
}
