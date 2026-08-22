import multicastDns from "multicast-dns";

const hostname = String(process.env.ROOMMUSE_LAN_HOSTNAME ?? "roommuse.local")
  .trim()
  .toLowerCase()
  .replace(/\.$/, "");
const address = String(process.env.ROOMMUSE_LAN_IP ?? "").trim();
const port = Number(process.env.ROOMMUSE_WEB_PORT ?? 8081);

if (!hostname.endsWith(".local") || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) || !Number.isInteger(port)) {
  throw new Error("ROOMMUSE_LAN_HOSTNAME, ROOMMUSE_LAN_IP, and ROOMMUSE_WEB_PORT must describe a valid LAN service.");
}

const serviceType = "_http._tcp.local";
const serviceInstance = `RoomMuse.${serviceType}`;
const discoveryType = "_services._dns-sd._udp.local";
const ttl = 120;
const mdns = multicastDns({ interface: address, reuseAddr: true });

const hostRecord = (recordTtl = ttl) => ({
  name: hostname,
  type: "A",
  class: "IN",
  ttl: recordTtl,
  flush: true,
  data: address,
});
const serviceRecords = (recordTtl = ttl) => [
  { name: serviceType, type: "PTR", class: "IN", ttl: recordTtl, data: serviceInstance },
  { name: serviceInstance, type: "SRV", class: "IN", ttl: recordTtl, flush: true, data: { priority: 0, weight: 0, port, target: hostname } },
  { name: serviceInstance, type: "TXT", class: "IN", ttl: recordTtl, flush: true, data: [Buffer.from("path=/")] },
];

function normalized(name) {
  return String(name ?? "").toLowerCase().replace(/\.$/, "");
}

function announce(recordTtl = ttl) {
  mdns.respond({ answers: [hostRecord(recordTtl), ...serviceRecords(recordTtl)], additionals: [] });
}

mdns.on("query", (query) => {
  const questions = Array.isArray(query.questions) ? query.questions : [];
  const wantsHost = questions.some((question) => normalized(question.name) === hostname && ["A", "ANY"].includes(question.type));
  const wantsServiceType = questions.some((question) => normalized(question.name) === serviceType && ["PTR", "ANY"].includes(question.type));
  const wantsInstance = questions.some((question) => normalized(question.name) === serviceInstance.toLowerCase() && ["SRV", "TXT", "ANY"].includes(question.type));
  const wantsDiscovery = questions.some((question) => normalized(question.name) === discoveryType && ["PTR", "ANY"].includes(question.type));
  if (!wantsHost && !wantsServiceType && !wantsInstance && !wantsDiscovery) return;

  const answers = [];
  if (wantsHost) answers.push(hostRecord());
  if (wantsServiceType) answers.push(serviceRecords()[0]);
  if (wantsInstance) answers.push(...serviceRecords().slice(1));
  if (wantsDiscovery) answers.push({ name: discoveryType, type: "PTR", class: "IN", ttl, data: serviceType });
  mdns.respond({ answers, additionals: wantsHost ? [] : [hostRecord(), ...serviceRecords().slice(1)] });
});

mdns.on("ready", () => {
  announce();
  console.log(`RoomMuse LAN name active: http://${hostname}:${port} -> ${address}:${port}`);
});
mdns.on("error", (error) => {
  console.error(`RoomMuse LAN name failed: ${error.message}`);
  process.exitCode = 1;
});
mdns.on("warning", (warning) => console.warn(`RoomMuse LAN name warning: ${warning.message}`));

const refresh = setInterval(announce, 60_000);
function shutdown() {
  clearInterval(refresh);
  announce(0);
  setTimeout(() => mdns.destroy(() => process.exit(0)), 100).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
