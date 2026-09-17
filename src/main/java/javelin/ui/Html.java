package javelin.ui;

import java.util.Map;
import java.util.function.Function;
import java.util.function.Consumer;
import java.util.function.Supplier;

public final class Html {
    private Html() {
    }

    public static VNode div(Object... children) { return node(); }
    public static VNode span(Object... children) { return node(); }
    public static VNode h1(Object... children) { return node(); }
    public static VNode h2(Object... children) { return node(); }
    public static VNode p(Object... children) { return node(); }
    public static VNode button(Object... children) { return node(); }
    public static VNode form(Object... children) { return node(); }
    public static VNode input(Object... children) { return node(); }
    public static VNode textarea(Object... children) { return node(); }
    public static VNode select(Object... children) { return node(); }
    public static VNode option(Object... children) { return node(); }
    public static VNode label(Object... children) { return node(); }
    public static VNode ul(Object... children) { return node(); }
    public static VNode li(Object... children) { return node(); }
    public static VNode a(Object... children) { return node(); }
    public static VNode img(Object... children) { return node(); }
    public static VNode tag(String name, Object... children) { return node(); }
    public static VNode fragment(Object... children) { return node(); }
    public static VNode text(Object value) { return node(); }

    public static <P> VNode component(Class<? extends Component<P>> type, P props, Object... children) { return node(); }
    public static VNode component(Class<? extends Component<Void>> type) { return node(); }
    public static VNode portal(String selector, Object... children) { return node(); }
    public static <P> Class<? extends Component<P>> lazy(String modulePath) { throw runtimeOnly(); }
    public static <P> Class<? extends Component<P>> lazy(String modulePath, String exportName) { throw runtimeOnly(); }
    public static <T> Object[] each(Iterable<T> values, Function<T, VNode> renderer) { return objects(); }
    public static VNode when(boolean condition, Supplier<VNode> truthy, Supplier<VNode> falsy) { return node(); }
    public static VNode when(boolean condition, Supplier<VNode> truthy) { return node(); }

    public static Object key(Object value) { return property(); }
    public static Object className(String value) { return property(); }
    public static Object tw(String... classes) { return property(); }
    public static Object twWhen(boolean condition, String truthy, String falsy) { return property(); }
    public static Object twWhen(boolean condition, String truthy) { return property(); }
    public static Object cssModule(String modulePath, String localName) { return property(); }
    public static Object id(String value) { return property(); }
    public static Object value(Object value) { return property(); }
    public static Object checked(boolean value) { return property(); }
    public static Object selected(boolean value) { return property(); }
    public static Object disabled(boolean value) { return property(); }
    public static Object required(boolean value) { return property(); }
    public static Object multiple(boolean value) { return property(); }
    public static Object placeholder(String value) { return property(); }
    public static Object href(String value) { return property(); }
    public static Object src(String value) { return property(); }
    public static Object alt(String value) { return property(); }
    public static Object title(String value) { return property(); }
    public static Object role(String value) { return property(); }
    public static Object tabIndex(int value) { return property(); }
    public static Object name(String value) { return property(); }
    public static Object type(String value) { return property(); }
    public static Object forId(String value) { return property(); }
    public static Object aria(String name, Object value) { return property(); }
    public static Object data(String name, Object value) { return property(); }
    public static Object attr(String name, Object value) { return property(); }
    public static Object style(Map<String, Object> values) { return property(); }
    public static Object onClick(Runnable handler) { return property(); }
    public static Object onClick(EventHandler handler) { return property(); }
    public static Object onInput(EventHandler handler) { return property(); }
    public static Object onChange(EventHandler handler) { return property(); }
    public static Object onSubmit(EventHandler handler) { return property(); }
    public static Object ref(Consumer<DomElement> callback) { return property(); }
    public static String eventValue(DomEvent event) { throw runtimeOnly(); }
    public static boolean eventChecked(DomEvent event) { throw runtimeOnly(); }
    public static <T> Context<T> context(T defaultValue) { throw runtimeOnly(); }
    public static Object route(String pattern, Supplier<VNode> renderer) { return property(); }
    public static Object route(String pattern, Function<RouteParams, VNode> renderer) { return property(); }
    public static Object routeGroup(String prefix, Function<VNode, VNode> layout, Object... routes) { return property(); }
    public static Object guard(Supplier<Boolean> allowed, String redirectTo, Object route) { return property(); }
    public static Object redirect(String pattern, String destination) { return property(); }
    public static VNode router(Object... routes) { return node(); }
    public static void navigate(String path) { throw runtimeOnly(); }
    public static VNode link(String path, Object... children) { return node(); }
    public static boolean formValid(FormField<?>... fields) { throw runtimeOnly(); }
    public static VNode modal(boolean open, String label, Object... children) { return node(); }
    public static VNode spinner(String label) { return node(); }

    private static VNode node() { throw runtimeOnly(); }
    private static Object property() { throw runtimeOnly(); }
    private static Object[] objects() { throw runtimeOnly(); }
    private static UnsupportedOperationException runtimeOnly() {
        return new UnsupportedOperationException("Implemented by the JavaScript runtime");
    }

    @FunctionalInterface
    public interface EventHandler {
        void handle(DomEvent event);
    }

    public interface DomEvent {
        Object target();
        void preventDefault();
        void stopPropagation();
    }

    public interface DomElement {
        void focus();
    }

    public interface RouteParams {
        String get(String name);
        String query(String name);
        String hash();
    }
}
