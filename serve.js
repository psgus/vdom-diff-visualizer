const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8123);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

http.createServer(function (req, res) {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(root, relativePath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.readFile(filePath, function (error, data) {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "text/plain; charset=utf-8"
    });
    res.end(data);
  });
}).listen(port, "127.0.0.1", function () {
  console.log("React Core Visualizer running at http://127.0.0.1:" + port);
});
