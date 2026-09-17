import javelin.ui.*;
import static javelin.ui.Html.*;
@App("#app") class DerivedApp extends BaseView {
  public VNode render() { return div(titleView()); }
}
