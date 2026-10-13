// The sample catalog, bundled into the Worker (it has no filesystem). Add a
// document by dropping its JSON here and importing it below.

import githubTos from "./github-tos.json";
import incidentLog from "./incident-log.json";
import mozillaPrivacy from "./mozilla-privacy.json";
import newsWire from "./news-wire.json";
import orderService from "./order-service.json";
import wikimediaTou from "./wikimedia-tou.json";

export const catalog: ReadonlyArray<unknown> = [githubTos, incidentLog, mozillaPrivacy, newsWire, orderService, wikimediaTou];
