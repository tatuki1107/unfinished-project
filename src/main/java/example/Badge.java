package example;

import javelin.ui.Component;
import javelin.ui.VNode;

import static javelin.ui.Html.*;

public class Badge extends Component<BadgeProps> {
    public VNode render() {
        return span(
                tw("mb-5 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700"),
                text(props().label())
        );
    }
}
