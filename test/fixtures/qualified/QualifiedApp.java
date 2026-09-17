import javelin.ui.App;
import javelin.ui.VNode;
import static javelin.ui.Html.*;
import java.util.Map;

@App("#app")
class QualifiedApp extends javelin.ui.Component<Void> {
    static String label() { return "static"; }
    public VNode render() { return div(style(Map.of("opacity", 1)), text(QualifiedApp.label()), text("a".equals("a"))); }
}
