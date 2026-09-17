import javelin.ui.Component;
import javelin.ui.VNode;

import static javelin.ui.Html.text;

public final class SharedCard extends Component<Void> {
    public VNode render() {
        return text("shared");
    }
}
