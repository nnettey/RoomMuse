const http = require("node:http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const apiPrefix = "/roommuse-api";

config.server.enhanceMiddleware = (metroMiddleware) => {
  return (request, response, next) => {
    if (!request.url?.startsWith(apiPrefix)) {
      return metroMiddleware(request, response, next);
    }

    const targetPath = request.url.slice(apiPrefix.length) || "/";
    const proxyRequest = http.request(
      {
        hostname: "127.0.0.1",
        port: 8787,
        path: targetPath,
        method: request.method,
        headers: request.headers,
      },
      (proxyResponse) => {
        const contentType = String(proxyResponse.headers["content-type"] ?? "");
        if (!contentType.includes("application/json")) {
          response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
          proxyResponse.pipe(response);
          return;
        }

        const chunks = [];
        proxyResponse.on("data", (chunk) => chunks.push(chunk));
        proxyResponse.on("end", () => {
          const host = request.headers.host;
          const privateOrigin = `http://${host}/designs/`;
          const publicOrigin = `https://${host}${apiPrefix}/designs/`;
          const body = Buffer.concat(chunks).toString("utf8").replaceAll(privateOrigin, publicOrigin);
          const headers = { ...proxyResponse.headers };
          delete headers["content-length"];
          headers["content-length"] = Buffer.byteLength(body);
          response.writeHead(proxyResponse.statusCode ?? 502, headers);
          response.end(body);
        });
      },
    );

    proxyRequest.on("error", (error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      response.writeHead(502, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      response.end(JSON.stringify({ error: "The RoomMuse API is unavailable." }));
    });
    request.pipe(proxyRequest);
  };
};

module.exports = config;
