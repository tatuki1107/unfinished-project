import javelin.ui.App;
import javelin.ui.Component;
import javelin.ui.Resource;
import javelin.ui.VNode;

import static javelin.ui.Html.text;

@App("#app")
public final class ResourceApp extends Component<Void> {
    private Resource<String> users = resource("/api/users", json -> json.string("name"),
        resourceOptions().retry(3).timeout(2500).staleTime(10000).cacheTime(60000).persistent("users"));

    public VNode render() {
        return text(users.hasValue() ? users.get() : "loading");
    }
}
