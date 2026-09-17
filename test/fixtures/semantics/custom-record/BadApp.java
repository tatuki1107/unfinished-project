import javelin.ui.*;
import static javelin.ui.Html.*;
record CustomRecord(String value) { String upper() { return value.toUpperCase(); } }
@App("#app") class BadApp extends Component<Void> {
  public VNode render() { return text("bad"); }
}
