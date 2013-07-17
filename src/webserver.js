var http = require('http');
var fs = require('fs');

console.log('Serving HTTP');

http.createServer(function (req, res) {
  fs.readFile('.'+req.url, function(err,data) {
    if (err) {
      console.log(req.url+': 500 '+err.message);
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end(err.message);
    }
    else {
      console.log(req.url+': 200 '+data.length);
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(data);
    }
  });
}).listen(8888);
console.log('Server running at 8888');