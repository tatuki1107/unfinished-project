import javelin.ui.*;
import static javelin.ui.Html.*;

@App("#app")
class OverloadedApp extends Component<Void> {
    String value() { return "zero"; }
    String value(int number) { return "one"; }
    public VNode render() { return text(value()); }
}
