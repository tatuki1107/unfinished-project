import javelin.ui.*;
import static javelin.ui.Html.*;
@App("#app") class BadApp extends Component<Void> {
  private static final Class<? extends Component<Void>> Page = lazy("./lazy-page.mjs");
  public VNode render() { return component(Page); }
}
