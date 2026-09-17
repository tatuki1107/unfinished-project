import javelin.ui.*;
import static javelin.ui.Html.*;
abstract class BaseView extends Component<Void> {
  protected String title = "base";
  protected VNode titleView() { return text(title); }
}
