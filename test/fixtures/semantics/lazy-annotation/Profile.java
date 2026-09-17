import javelin.ui.Component;
import javelin.ui.Lazy;
import javelin.ui.VNode;

import static javelin.ui.Html.component;

@Lazy
public final class Profile extends Component<Void> {
    public VNode render() {
        return component(SharedCard.class);
    }
}
