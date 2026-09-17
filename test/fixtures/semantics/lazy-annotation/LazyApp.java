import javelin.ui.App;
import javelin.ui.Component;
import javelin.ui.VNode;

import static javelin.ui.Html.*;

@App("#app")
public final class LazyApp extends Component<Void> {
    public VNode render() {
        return div(component(Details.class), component(Profile.class));
    }
}
