import javelin.ui.*;
import static javelin.ui.Html.*;
@App("#app") class BadApp extends Component<Void> {
  public VNode render() { int value = 5; value /= 2; return text(value); }
}
