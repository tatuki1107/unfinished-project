package javelin.ui;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Emits this component as a separate JavaScript module loaded on demand. */
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.TYPE)
public @interface Lazy {
}
