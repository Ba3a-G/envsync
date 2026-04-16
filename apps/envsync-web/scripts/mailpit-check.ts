import { waitForService } from "../e2e/helpers/auth";
import { getUiHarnessConfig } from "../e2e/helpers/config";

const config = getUiHarnessConfig();

await waitForService(config.mailpitUrl, "Mailpit");
const response = await fetch(`${config.mailpitUrl}/api/v1/messages`);
if (!response.ok) {
	throw new Error(`Mailpit API check failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json() as { messages?: Array<{ Subject?: string; ID?: string }> };
const messages = payload.messages ?? [];
console.log(`[ui-mailpit] healthy: ${config.mailpitUrl}`);
console.log(`[ui-mailpit] messages: ${messages.length}`);
if (messages[0]) {
	console.log(`[ui-mailpit] latest: ${messages[0].Subject ?? "(no subject)"} (${messages[0].ID ?? "unknown"})`);
}
