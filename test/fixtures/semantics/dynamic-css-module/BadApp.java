import javelin.ui.*;
import static javelin.ui.Html.*;
@App("#app") class BadApp extends Component<Void> {
  public VNode render() { String name = "panel"; return div(cssModule("styles/counter.module.css", name)); }
}
