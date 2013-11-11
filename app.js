var fs = require('fs');
var _ = require('underscore');
var util = require('util');
var game = JSON.parse(fs.readFileSync('initial.json').toString());
var net = require('net');
var http = require('http');

var number_of_clients = 0;
var clients = [];
function Client(stream) {
  this.name = null;
  this.stream = stream;
}

var tcpServer = net.createServer(function(socket) {
  number_of_clients++;
  console.log('Client ' + number_of_clients + ' has connected');
  var client = new Client(socket);
  client.name = 'Client ' + number_of_clients;
  clients.push(client);

  client.stream.on('data', function(data) {
    console.log('Data received from ' + client.name + ': ' + data);
    client.stream.write('Hello from the server!\n');
  });

  client.stream.on('close', function() {
    console.log(client.name + ' disconnected');
  });

}).listen(1337, '127.0.0.1');

var httpServer = http.createServer(function(req, res) {
  res.writeHead(200, {'content-type':'text/plain'});
  res.write('Clients:\n');
  clients.forEach(function(client) {
    res.write(client.name + '\n');
  });
  res.end();
}).listen(3000);
