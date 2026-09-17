import javelin.ui.*;
import static javelin.ui.Html.*;
@App("#app") class BadApp extends Component<Void> {
  public VNode render() { int value = (int) 2.9; return text(value); }
}
