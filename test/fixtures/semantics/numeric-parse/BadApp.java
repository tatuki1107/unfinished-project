import javelin.ui.*;
import static javelin.ui.Html.*;
@App("#app") class BadApp extends Component<Void> {
  public VNode render() { return text(Integer.parseInt("12")); }
}
